/**
 * Dashboard API module
 * Provides functions for dashboard statistics, query logs, and audit logs
 */

import axios from 'axios'
import { backendBaseUrl } from '@/lib/constants'
import { useSettingsStore } from '@/stores/settings'

// Create axios instance with same config as lightrag.ts
const dashboardAxios = axios.create({
    baseURL: backendBaseUrl,
    headers: {
        'Content-Type': 'application/json',
    },
})

dashboardAxios.interceptors.request.use((config) => {
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
export interface DashboardStats {
    queries_today: number
    total_documents: number
    tokens_used_today: number
    cost_today: number
    avg_response_time_ms: number
    total_queries: number
    total_tokens: number
    total_cost: number
}

export interface QueryLogEntry {
    user_email: string
    user_role: string
    query_text: string
    query_mode: string
    response_preview: string
    execution_time_ms: number
    timestamp: string
    tokens_used?: number
    cost?: number
}

export interface QueryLogsResponse {
    logs: QueryLogEntry[]
    total: number
    page: number
    page_size: number
    total_pages: number
}

export interface QueryTrendEntry {
    date: string
    count: number
    tokens: number
    cost: number
}

export interface QueryTrendsResponse {
    trends: QueryTrendEntry[]
    period_days: number
}

export interface AuditLogEntry {
    user_email: string
    action: string
    resource_type: string
    resource_id: string
    timestamp: string
    ip_address?: string
    old_value?: Record<string, any>
    new_value?: Record<string, any>
}

export interface AuditLogsResponse {
    logs: AuditLogEntry[]
    total: number
    page: number
    page_size: number
    total_pages: number
}

// API Functions
export async function getDashboardStats(): Promise<DashboardStats> {
    const response = await dashboardAxios.get<DashboardStats>('/logs/stats')
    return response.data
}

export async function getQueryLogs(params: {
    page?: number
    page_size?: number
    user_email?: string
    query_mode?: string
    period?: 'today' | 'week' | 'month' | 'all'
}): Promise<QueryLogsResponse> {
    const response = await dashboardAxios.get<QueryLogsResponse>('/logs/queries', { params })
    return response.data
}

export async function getQueryTrends(days: number = 7): Promise<QueryTrendsResponse> {
    const response = await dashboardAxios.get<QueryTrendsResponse>('/logs/trends', {
        params: { days }
    })
    return response.data
}

export async function getAuditLogs(params: {
    page?: number
    page_size?: number
    action?: string
    user_email?: string
    period?: 'today' | 'week' | 'month' | 'all'
}): Promise<AuditLogsResponse> {
    const response = await dashboardAxios.get<AuditLogsResponse>('/logs/audit', { params })
    return response.data
}

export async function exportQueryLogs(period: 'today' | 'week' | 'month' | 'all' = 'all'): Promise<Blob> {
    const response = await dashboardAxios.post('/logs/export', null, {
        params: { period },
        responseType: 'blob'
    })
    return response.data
}

// Helper function to download exported logs
export function downloadExportedLogs(blob: Blob, filename?: string) {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || `query_logs_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
}

/**
 * Log a chat-mode query that bypassed RAG (e.g. agent mode "chat" classification).
 * This ensures dashboard metrics count ALL queries regardless of chat mode.
 */
export async function logChatQuery(params: {
    query_text: string
    response_preview?: string
    execution_time_ms: number
    tokens_used?: number
    cost?: number
}): Promise<void> {
    await dashboardAxios.post('/logs/log-chat', params)
}

