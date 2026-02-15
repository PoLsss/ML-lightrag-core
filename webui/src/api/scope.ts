/**
 * Document Scope API module
 * Provides functions for managing document access scopes
 */

import axios from 'axios'
import { backendBaseUrl } from '@/lib/constants'
import { useSettingsStore } from '@/stores/settings'

// Create axios instance with same config as other API modules
const scopeAxios = axios.create({
    baseURL: backendBaseUrl,
    headers: {
        'Content-Type': 'application/json',
    },
})

scopeAxios.interceptors.request.use((config) => {
    const apiKey = useSettingsStore.getState().apiKey
    const token = localStorage.getItem('LIGHTRAG-API-TOKEN')

    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
    }
    if (apiKey) {
        config.headers['X-API-Key'] = apiKey
    }
    return config
})

// Types
export interface DocumentScopeInfo {
    doc_id: string
    file_path: string
    scope: 'public' | 'internal'
    updated_at?: string
    updated_by?: string
}

export interface ScopeListResponse {
    documents: DocumentScopeInfo[]
    total: number
    page: number
    page_size: number
}

export interface ScopeStatsResponse {
    total_documents: number
    public_count: number
    internal_count: number
    unscoped_count: number
}

export interface MessageResponse {
    status: string
    message: string
}

// API Functions

/**
 * Get list of documents with their scope information
 * Admin and Teacher only
 */
export async function getDocumentsWithScope(params: {
    page?: number
    page_size?: number
    scope_filter?: 'public' | 'internal'
}): Promise<ScopeListResponse> {
    const response = await scopeAxios.get<ScopeListResponse>('/scope/documents', { params })
    return response.data
}

/**
 * Update a document's access scope
 * Admin and Teacher only
 */
export async function updateDocumentScope(
    docId: string,
    scope: 'public' | 'internal'
): Promise<MessageResponse> {
    const response = await scopeAxios.put<MessageResponse>(`/scope/documents/${docId}`, {
        scope
    })
    return response.data
}

/**
 * Get scope statistics
 * Admin and Teacher only
 */
export async function getScopeStats(): Promise<ScopeStatsResponse> {
    const response = await scopeAxios.get<ScopeStatsResponse>('/scope/stats')
    return response.data
}

/**
 * Force sync a document's scope to Neo4j
 * Admin only
 */
export async function syncDocumentScope(docId: string): Promise<MessageResponse> {
    const response = await scopeAxios.post<MessageResponse>(`/scope/sync/${docId}`)
    return response.data
}
