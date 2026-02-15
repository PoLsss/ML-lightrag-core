"""
MinIO Storage Service — Multi-Tenant Document Storage.

This module provides a MinIO client wrapper that supports multi-tenant
document storage with proper metadata structure.

Object key format:
    {workspace}/{uploaded_by_role}/{filename}

Metadata stored on each object:
    - x-amz-meta-doc-id: LightRAG document ID
    - x-amz-meta-tenant-role: Uploader's role (admin/teacher/student/system)
    - x-amz-meta-uploaded-by: Uploader's email
    - x-amz-meta-scope: Access scope (public/internal)
    - x-amz-meta-workspace: Workspace name
    - x-amz-meta-original-filename: Original filename
    - x-amz-meta-upload-timestamp: Upload ISO timestamp
"""

from __future__ import annotations

import os
import io
import mimetypes
from datetime import datetime, timezone, timedelta
from typing import Optional, BinaryIO

from minio import Minio
from minio.error import S3Error
from lightrag.utils import logger

# UTC+7 timezone
UTC_PLUS_7 = timezone(timedelta(hours=7))

# Default content type for unknown files
DEFAULT_CONTENT_TYPE = "application/octet-stream"

# Mapping of file extensions to MIME types for common document types
MIME_TYPE_MAP = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".md": "text/markdown",
    ".json": "application/json",
    ".xml": "application/xml",
    ".html": "text/html",
    ".htm": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


def get_content_type(filename: str) -> str:
    """Determine the MIME type based on file extension."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in MIME_TYPE_MAP:
        return MIME_TYPE_MAP[ext]
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or DEFAULT_CONTENT_TYPE


class MinIOStorage:
    """
    MinIO storage client with multi-tenant support.

    Usage:
        storage = MinIOStorage.from_env()
        await storage.upload_document(file_data, filename, ...)
        file_data, content_type = await storage.get_document(object_key)
    """

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        secure: bool = False,
    ):
        self.bucket = bucket
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self._ensure_bucket()

    @classmethod
    def from_env(cls) -> "MinIOStorage":
        """Create a MinIOStorage instance from environment variables."""
        endpoint = os.getenv("MINIO_ENDPOINT", "localhost:10000")
        access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        bucket = os.getenv("MINIO_BUCKET", "minio-db-documents")
        secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
        return cls(endpoint, access_key, secret_key, bucket, secure)

    def _ensure_bucket(self):
        """Create the bucket if it doesn't exist."""
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
                logger.info(f"MinIO: Created bucket '{self.bucket}'")
            else:
                logger.info(f"MinIO: Bucket '{self.bucket}' already exists")
        except S3Error as e:
            logger.error(f"MinIO: Failed to ensure bucket '{self.bucket}': {e}")
            raise

    def _build_object_key(
        self,
        filename: str,
        workspace: str = "default",
        uploaded_by_role: str = "system",
    ) -> str:
        """
        Build the object key with multi-tenant path structure.

        Format: {workspace}/{role}/{filename}
        Examples:
            default/admin/report.pdf
            space1/teacher/lecture_notes.docx
            default/student/homework.pdf
        """
        return f"{workspace}/{uploaded_by_role}/{filename}"

    def upload_document(
        self,
        file_data: BinaryIO,
        filename: str,
        file_size: int,
        workspace: str = "default",
        doc_id: str = "",
        uploaded_by: str = "system",
        uploaded_by_role: str = "system",
        scope: str = "internal",
    ) -> str:
        """
        Upload a document to MinIO with multi-tenant metadata.

        Args:
            file_data: File-like object to upload.
            filename: Original filename.
            file_size: Size of file in bytes.
            workspace: Workspace/tenant namespace.
            doc_id: LightRAG document ID.
            uploaded_by: Uploader email.
            uploaded_by_role: Uploader role.
            scope: Access scope (public/internal).

        Returns:
            The object key (path) in MinIO.
        """
        object_key = self._build_object_key(filename, workspace, uploaded_by_role)
        content_type = get_content_type(filename)
        now = datetime.now(UTC_PLUS_7).isoformat()

        metadata = {
            "doc-id": doc_id,
            "tenant-role": uploaded_by_role,
            "uploaded-by": uploaded_by,
            "scope": scope,
            "workspace": workspace,
            "original-filename": filename,
            "upload-timestamp": now,
        }

        try:
            self.client.put_object(
                self.bucket,
                object_key,
                file_data,
                length=file_size,
                content_type=content_type,
                metadata=metadata,
            )
            logger.info(
                f"MinIO: Uploaded '{filename}' as '{object_key}' "
                f"(size={file_size}, type={content_type}, "
                f"by={uploaded_by}, role={uploaded_by_role}, scope={scope})"
            )
            return object_key
        except S3Error as e:
            logger.error(f"MinIO: Failed to upload '{filename}': {e}")
            raise

    def get_document(self, object_key: str) -> tuple[bytes, str]:
        """
        Retrieve a document from MinIO.

        Args:
            object_key: The object key in MinIO.

        Returns:
            Tuple of (file_bytes, content_type).
        """
        try:
            response = self.client.get_object(self.bucket, object_key)
            data = response.read()
            content_type = response.headers.get("Content-Type", DEFAULT_CONTENT_TYPE)
            response.close()
            response.release_conn()
            return data, content_type
        except S3Error as e:
            logger.error(f"MinIO: Failed to get '{object_key}': {e}")
            raise

    def get_document_stream(self, object_key: str):
        """
        Get a streaming response for a document from MinIO.

        Args:
            object_key: The object key in MinIO.

        Returns:
            Tuple of (response_object, content_type, content_length).
            Caller must close the response.
        """
        try:
            response = self.client.get_object(self.bucket, object_key)
            content_type = response.headers.get("Content-Type", DEFAULT_CONTENT_TYPE)
            content_length = response.headers.get("Content-Length", "0")
            return response, content_type, int(content_length)
        except S3Error as e:
            logger.error(f"MinIO: Failed to stream '{object_key}': {e}")
            raise

    def get_presigned_url(self, object_key: str, expires_seconds: int = 3600) -> str:
        """
        Generate a presigned URL for direct browser access.

        Args:
            object_key: The object key in MinIO.
            expires_seconds: Expiry time in seconds (default: 1 hour).

        Returns:
            Presigned URL string.
        """
        from datetime import timedelta

        try:
            url = self.client.presigned_get_object(
                self.bucket,
                object_key,
                expires=timedelta(seconds=expires_seconds),
            )
            return url
        except S3Error as e:
            logger.error(f"MinIO: Failed to generate presigned URL for '{object_key}': {e}")
            raise

    def delete_document(self, object_key: str) -> bool:
        """
        Delete a document from MinIO.

        Args:
            object_key: The object key in MinIO.

        Returns:
            True if deleted successfully.
        """
        try:
            self.client.remove_object(self.bucket, object_key)
            logger.info(f"MinIO: Deleted '{object_key}'")
            return True
        except S3Error as e:
            logger.error(f"MinIO: Failed to delete '{object_key}': {e}")
            return False

    def document_exists(self, object_key: str) -> bool:
        """Check if a document exists in MinIO."""
        try:
            self.client.stat_object(self.bucket, object_key)
            return True
        except S3Error:
            return False

    def find_document_by_filename(
        self, filename: str, workspace: str = "default"
    ) -> Optional[str]:
        """
        Search for a document by filename across all role prefixes in a workspace.

        Args:
            filename: The filename to search for.
            workspace: The workspace to search in.

        Returns:
            The object key if found, None otherwise.
        """
        prefix = f"{workspace}/"
        try:
            objects = self.client.list_objects(
                self.bucket, prefix=prefix, recursive=True
            )
            for obj in objects:
                if obj.object_name.endswith(f"/{filename}"):
                    return obj.object_name
            return None
        except S3Error as e:
            logger.error(f"MinIO: Failed to search for '{filename}' in '{workspace}': {e}")
            return None


# Singleton instance (lazy-initialized)
_minio_storage: Optional[MinIOStorage] = None


def get_minio_storage() -> MinIOStorage:
    """Get the singleton MinIO storage instance."""
    global _minio_storage
    if _minio_storage is None:
        _minio_storage = MinIOStorage.from_env()
    return _minio_storage
