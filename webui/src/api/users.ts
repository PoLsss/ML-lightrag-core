/**
 * Users API module
 * Provides functions for user management and authentication
 */

import axios from 'axios'
import { backendBaseUrl } from '@/lib/constants'
import { useSettingsStore } from '@/stores/settings'

// Create axios instance with same config as lightrag.ts
const usersAxios = axios.create({
    baseURL: backendBaseUrl,
    headers: {
        'Content-Type': 'application/json',
    },
})

usersAxios.interceptors.request.use((config) => {
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
export interface UserProfile {
    email: string
    display_name: string
    role: 'admin' | 'teacher' | 'student'
    status: 'active' | 'inactive' | 'suspended'
    created_at: string
    last_login?: string
    metadata?: Record<string, unknown>
}

export interface LoginRequest {
    email: string
    password: string
}

export interface LoginResponse {
    access_token: string
    token_type: string
    user: {
        email: string
        display_name: string
        role: string
        status: string
    }
    message: string
}

export interface CreateUserRequest {
    email: string
    password: string
    display_name: string
    role?: 'admin' | 'teacher' | 'student'
    metadata?: Record<string, unknown>
}

export interface UpdateUserRequest {
    display_name?: string
    password?: string
    role?: 'admin' | 'teacher' | 'student'
    status?: 'active' | 'inactive' | 'suspended'
    metadata?: Record<string, unknown>
}

export interface UserListResponse {
    users: UserProfile[]
    total: number
}

export interface MessageResponse {
    status: string
    message: string
}

// API Functions
export async function loginUser(email: string, password: string): Promise<LoginResponse> {
    const response = await usersAxios.post<LoginResponse>('/users/login', { email, password })
    return response.data
}

export interface RegisterRequest {
    email: string
    password: string
    confirm_password: string
}

export async function registerUser(data: RegisterRequest): Promise<MessageResponse> {
    const response = await usersAxios.post<MessageResponse>('/users/register', data)
    return response.data
}

export async function getCurrentUser(): Promise<UserProfile> {
    const response = await usersAxios.get<UserProfile>('/users/me')
    return response.data
}

export async function getUsers(): Promise<UserListResponse> {
    const response = await usersAxios.get<UserListResponse>('/users')
    return response.data
}

export async function createUser(userData: CreateUserRequest): Promise<MessageResponse> {
    const response = await usersAxios.post<MessageResponse>('/users', userData)
    return response.data
}

export async function updateUser(email: string, userData: UpdateUserRequest): Promise<MessageResponse> {
    const response = await usersAxios.put<MessageResponse>(
        `/users/${encodeURIComponent(email)}`,
        userData
    )
    return response.data
}

export async function deleteUser(email: string): Promise<MessageResponse> {
    const response = await usersAxios.delete<MessageResponse>(
        `/users/${encodeURIComponent(email)}`
    )
    return response.data
}
