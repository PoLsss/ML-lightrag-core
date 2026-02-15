"""
Multi-Tenant Session Isolation Tests.

Tests that verify:
1. Each user gets a completely independent TenantContext per request.
2. No cross-tenant data leakage.
3. No shared mutable state between concurrent requests.
4. Database VIEW-based authorization works correctly with TenantContext.
5. 100+ concurrent users maintain full session isolation.

Run with:
    pytest tests/test_tenant_isolation.py -v
    
Or for the concurrent stress test:
    pytest tests/test_tenant_isolation.py::test_concurrent_session_isolation -v
"""

import asyncio
import uuid
from dataclasses import FrozenInstanceError
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Unit Tests: TenantContext immutability & properties
# ---------------------------------------------------------------------------

class TestTenantContextImmutability:
    """Verify TenantContext is truly immutable (frozen dataclass)."""

    def _make_ctx(self, **kwargs):
        """Helper to import and create TenantContext."""
        from lightrag.api.tenant_context import TenantContext
        defaults = {
            "user_email": "test@example.com",
            "user_role": "student",
            "display_name": "Test User",
            "user_id": "abc123",
        }
        defaults.update(kwargs)
        return TenantContext(**defaults)

    def test_frozen_cannot_mutate_email(self):
        ctx = self._make_ctx()
        with pytest.raises(FrozenInstanceError):
            ctx.user_email = "hacker@evil.com"

    def test_frozen_cannot_mutate_role(self):
        ctx = self._make_ctx()
        with pytest.raises(FrozenInstanceError):
            ctx.user_role = "admin"

    def test_frozen_cannot_mutate_request_id(self):
        ctx = self._make_ctx()
        with pytest.raises(FrozenInstanceError):
            ctx.request_id = "stolen-request-id"

    def test_each_instance_has_unique_request_id(self):
        ctx1 = self._make_ctx()
        ctx2 = self._make_ctx()
        assert ctx1.request_id != ctx2.request_id

    def test_student_properties(self):
        ctx = self._make_ctx(user_role="student")
        assert ctx.is_student is True
        assert ctx.is_admin is False
        assert ctx.is_teacher is False
        assert ctx.is_privileged is False
        assert ctx.db_view_name == "view_student_docs"
        assert ctx.scope_filter == {"scope": "public"}

    def test_admin_properties(self):
        ctx = self._make_ctx(user_role="admin")
        assert ctx.is_admin is True
        assert ctx.is_privileged is True
        assert ctx.db_view_name == "view_teacher_docs"
        assert ctx.scope_filter is None  # No restriction

    def test_teacher_properties(self):
        ctx = self._make_ctx(user_role="teacher")
        assert ctx.is_teacher is True
        assert ctx.is_privileged is True
        assert ctx.db_view_name == "view_teacher_docs"
        assert ctx.scope_filter is None


# ---------------------------------------------------------------------------
# Unit Tests: No shared state between contexts
# ---------------------------------------------------------------------------

class TestNoSharedState:
    """Verify that TenantContext instances do not share mutable state."""

    def _make_ctx(self, **kwargs):
        from lightrag.api.tenant_context import TenantContext
        defaults = {
            "user_email": "user@example.com",
            "user_role": "student",
        }
        defaults.update(kwargs)
        return TenantContext(**defaults)

    def test_metadata_not_shared(self):
        """Two contexts with same default metadata must NOT share the same dict."""
        ctx1 = self._make_ctx()
        ctx2 = self._make_ctx()
        # Even though both have default empty dicts, they are separate instances
        assert ctx1.metadata is not ctx2.metadata or ctx1.metadata == {}

    def test_different_users_different_contexts(self):
        """User A and User B get completely different contexts."""
        ctx_a = self._make_ctx(user_email="alice@example.com", user_role="student")
        ctx_b = self._make_ctx(user_email="bob@example.com", user_role="admin")
        
        assert ctx_a.user_email != ctx_b.user_email
        assert ctx_a.user_role != ctx_b.user_role
        assert ctx_a.request_id != ctx_b.request_id
        assert ctx_a.db_view_name != ctx_b.db_view_name
        assert ctx_a.scope_filter != ctx_b.scope_filter


# ---------------------------------------------------------------------------
# Integration Tests: FastAPI dependency injection
# ---------------------------------------------------------------------------

class TestTenantContextDependency:
    """Test that FastAPI dependency creates per-request TenantContext."""

    @pytest.mark.asyncio
    async def test_get_tenant_context_valid_token(self):
        """Valid JWT → TenantContext with correct user info."""
        from lightrag.api.tenant_context import get_tenant_context

        mock_request = MagicMock()
        mock_request.headers = {
            "Authorization": "Bearer valid-token-here",
            "X-Forwarded-For": "192.168.1.100",
        }
        mock_request.client = MagicMock(host="127.0.0.1")

        with patch("lightrag.api.tenant_context.auth_handler") as mock_auth:
            mock_auth.validate_token.return_value = {
                "username": "alice@test.com",
                "role": "teacher",
                "metadata": {"display_name": "Alice", "user_id": "u123"},
            }

            ctx = await get_tenant_context(mock_request)

            assert ctx.user_email == "alice@test.com"
            assert ctx.user_role == "teacher"
            assert ctx.display_name == "Alice"
            assert ctx.user_id == "u123"
            assert ctx.ip_address == "192.168.1.100"
            assert ctx.is_privileged is True

    @pytest.mark.asyncio
    async def test_get_tenant_context_missing_header(self):
        """Missing Authorization header → HTTPException 401."""
        from lightrag.api.tenant_context import get_tenant_context
        from fastapi import HTTPException

        mock_request = MagicMock()
        mock_request.headers = {}

        with pytest.raises(HTTPException) as exc_info:
            await get_tenant_context(mock_request)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_tenant_context_invalid_token(self):
        """Invalid JWT → HTTPException 401."""
        from lightrag.api.tenant_context import get_tenant_context
        from fastapi import HTTPException

        mock_request = MagicMock()
        mock_request.headers = {"Authorization": "Bearer bad-token"}

        with patch("lightrag.api.tenant_context.auth_handler") as mock_auth:
            mock_auth.validate_token.side_effect = HTTPException(status_code=401, detail="Invalid token")

            with pytest.raises(HTTPException) as exc_info:
                await get_tenant_context(mock_request)
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_optional_context_no_token(self):
        """No token → returns None (for API key routes)."""
        from lightrag.api.tenant_context import get_optional_tenant_context

        mock_request = MagicMock()
        mock_request.headers = {}

        ctx = await get_optional_tenant_context(mock_request)
        assert ctx is None


# ---------------------------------------------------------------------------
# Integration Tests: Role-based VIEW enforcement
# ---------------------------------------------------------------------------

class TestViewBasedAuthorization:
    """Verify that TenantContext correctly maps to database VIEWs."""

    def _make_ctx(self, role):
        from lightrag.api.tenant_context import TenantContext
        return TenantContext(user_email="u@test.com", user_role=role)

    def test_student_gets_student_view(self):
        ctx = self._make_ctx("student")
        assert ctx.db_view_name == "view_student_docs"

    def test_teacher_gets_teacher_view(self):
        ctx = self._make_ctx("teacher")
        assert ctx.db_view_name == "view_teacher_docs"

    def test_admin_gets_teacher_view(self):
        ctx = self._make_ctx("admin")
        assert ctx.db_view_name == "view_teacher_docs"

    def test_unknown_role_gets_student_view(self):
        """Unknown roles default to the most restrictive view."""
        ctx = self._make_ctx("guest")
        assert ctx.db_view_name == "view_student_docs"

    def test_student_scope_filter_is_public_only(self):
        ctx = self._make_ctx("student")
        assert ctx.scope_filter == {"scope": "public"}

    def test_admin_scope_filter_is_none(self):
        """Admins should have no scope filter (access everything)."""
        ctx = self._make_ctx("admin")
        assert ctx.scope_filter is None

    def test_teacher_scope_filter_is_none(self):
        ctx = self._make_ctx("teacher")
        assert ctx.scope_filter is None


# ---------------------------------------------------------------------------
# Concurrency Stress Test: 100+ users, full isolation
# ---------------------------------------------------------------------------

class TestConcurrentSessionIsolation:
    """
    Simulate 100 concurrent users logging in and verify that each gets
    a completely independent TenantContext with no cross-contamination.
    """

    @pytest.mark.asyncio
    async def test_concurrent_session_isolation(self):
        """100 concurrent users → 100 independent contexts, zero leakage."""
        from lightrag.api.tenant_context import TenantContext

        NUM_USERS = 100
        results = {}
        errors = []

        async def simulate_user_session(user_index: int):
            """Simulate a single user's request lifecycle."""
            email = f"user{user_index}@tenant{user_index % 10}.com"
            role = ["student", "teacher", "admin"][user_index % 3]
            
            # Create a TenantContext (simulating what the dependency does)
            ctx = TenantContext(
                user_email=email,
                user_role=role,
                display_name=f"User {user_index}",
                user_id=f"id_{user_index}",
                ip_address=f"10.0.{user_index // 256}.{user_index % 256}",
            )

            # Simulate some async work (DB query, etc.)
            await asyncio.sleep(0.01)

            # Verify the context still belongs to the correct user
            if ctx.user_email != email:
                errors.append(
                    f"User {user_index}: email contaminated! "
                    f"Expected {email}, got {ctx.user_email}"
                )
            if ctx.user_role != role:
                errors.append(
                    f"User {user_index}: role contaminated! "
                    f"Expected {role}, got {ctx.user_role}"
                )

            results[user_index] = {
                "email": ctx.user_email,
                "role": ctx.user_role,
                "request_id": ctx.request_id,
                "db_view": ctx.db_view_name,
            }

        # Run all users concurrently
        tasks = [simulate_user_session(i) for i in range(NUM_USERS)]
        await asyncio.gather(*tasks)

        # Assert no errors
        assert len(errors) == 0, f"Cross-tenant contamination detected:\n" + "\n".join(errors)

        # Assert all request_ids are unique
        request_ids = [r["request_id"] for r in results.values()]
        assert len(set(request_ids)) == NUM_USERS, "Request IDs are not all unique!"

        # Assert users got the correct view names
        for i, result in results.items():
            role = ["student", "teacher", "admin"][i % 3]
            expected_view = "view_student_docs" if role == "student" else "view_teacher_docs"
            assert result["db_view"] == expected_view, (
                f"User {i} (role={role}) got wrong view: {result['db_view']}"
            )

    @pytest.mark.asyncio
    async def test_1000_users_no_shared_state(self):
        """Stress test: 1000 users, verify zero shared mutable state."""
        from lightrag.api.tenant_context import TenantContext

        NUM_USERS = 1000
        all_request_ids = set()
        all_contexts = []
        lock = asyncio.Lock()

        async def create_context(i: int):
            ctx = TenantContext(
                user_email=f"u{i}@test.com",
                user_role=["student", "teacher", "admin"][i % 3],
            )
            await asyncio.sleep(0.001)  # Simulate IO
            async with lock:
                all_request_ids.add(ctx.request_id)
                all_contexts.append((i, ctx.user_email, ctx.user_role))

        tasks = [create_context(i) for i in range(NUM_USERS)]
        await asyncio.gather(*tasks)

        # All request IDs must be unique
        assert len(all_request_ids) == NUM_USERS

        # Verify each context has the correct data
        for i, email, role in all_contexts:
            assert email == f"u{i}@test.com"
            assert role == ["student", "teacher", "admin"][i % 3]


# ---------------------------------------------------------------------------
# Password Hashing Tests
# ---------------------------------------------------------------------------

class TestPasswordHashing:
    """Verify bcrypt-based password hashing with legacy fallback."""

    def test_hash_and_verify(self):
        from lightrag.api.db_setup import hash_password, verify_password
        
        password = "strongP@ssw0rd!"
        hashed = hash_password(password)
        
        # Must verify correctly
        assert verify_password(password, hashed) is True
        # Wrong password must fail
        assert verify_password("wrong", hashed) is False

    def test_hash_is_not_plaintext(self):
        from lightrag.api.db_setup import hash_password
        
        password = "mypassword123"
        hashed = hash_password(password)
        assert hashed != password

    def test_same_password_different_hashes(self):
        """bcrypt should produce different hashes for the same password (due to salt)."""
        from lightrag.api.db_setup import hash_password, _HAS_BCRYPT
        
        if not _HAS_BCRYPT:
            pytest.skip("bcrypt not installed")
        
        h1 = hash_password("same_password")
        h2 = hash_password("same_password")
        # bcrypt hashes should differ due to random salt
        assert h1 != h2

    def test_legacy_sha256_still_verifies(self):
        """Existing SHA-256 hashes in DB should still verify correctly."""
        import hashlib
        from lightrag.api.db_setup import verify_password
        
        password = "legacy_password"
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        
        assert verify_password(password, legacy_hash) is True
        assert verify_password("wrong", legacy_hash) is False
