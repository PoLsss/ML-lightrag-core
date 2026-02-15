/**
 * Document ACL API Module
 * Provides functions for managing document access control
 */

import axios from 'axios'
import { backendBaseUrl } from '@/lib/constants'

const aclClient = axios.create({
    baseURL: backendBaseUrl,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Add auth token to requests
aclClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('LIGHTRAG-API-TOKEN')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Types
export interface DocumentACL {
    doc_id: string
    file_path: string
    access_scope: 'internal' | 'public'
    created_by: string
    created_at: string
    updated_at: string
    updated_by: string
}

export interface DocumentACLListResponse {
    documents: DocumentACL[]
    total: number
}

export interface AccessCheckResponse {
    doc_id: string
    can_access: boolean
    access_scope: string
    reason: string
}

// API Functions

/**
 * Get all document ACLs (Admin only)
 */
export const getDocumentACLs = async (): Promise<DocumentACLListResponse> => {
    const response = await aclClient.get('/acl/documents')
    return response.data
}

/**
 * Update document access scope (Admin only)
 */
export const updateDocumentACL = async (
    docId: string,
    accessScope: 'internal' | 'public'
): Promise<{ status: string; message: string }> => {
    const response = await aclClient.put(`/acl/documents/${encodeURIComponent(docId)}`, {
        access_scope: accessScope
    })
    return response.data
}

/**
 * Create document ACL entry (Admin only)
 */
export const createDocumentACL = async (
    docId: string,
    accessScope: 'internal' | 'public'
): Promise<{ status: string; message: string }> => {
    const response = await aclClient.post(`/acl/documents/${encodeURIComponent(docId)}`, {
        access_scope: accessScope
    })
    return response.data
}

/**
 * Check if user can access a document
 */
export const checkDocumentAccess = async (docId: string): Promise<AccessCheckResponse> => {
    const response = await aclClient.get(`/acl/check/${encodeURIComponent(docId)}`)
    return response.data
}
