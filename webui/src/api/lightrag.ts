import axios, { AxiosError } from "axios";
import {
  backendBaseUrl,
  popularLabelsDefaultLimit,
  searchLabelsDefaultLimit,
} from "@/lib/constants";
import { errorMessage } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";
import { navigationService } from "@/services/navigation";

// Types
export type LightragNodeType = {
  id: string;
  labels: string[];
  properties: Record<string, any>;
};

export type LightragEdgeType = {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
};

export type LightragGraphType = {
  nodes: LightragNodeType[];
  edges: LightragEdgeType[];
};

export type LightragStatus = {
  status: "healthy";
  working_directory: string;
  input_directory: string;
  configuration: {
    llm_binding: string;
    llm_binding_host: string;
    llm_model: string;
    embedding_binding: string;
    embedding_binding_host: string;
    embedding_model: string;
    kv_storage: string;
    doc_status_storage: string;
    graph_storage: string;
    vector_storage: string;
    workspace?: string;
    max_graph_nodes?: string;
    enable_rerank?: boolean;
    rerank_binding?: string | null;
    rerank_model?: string | null;
    rerank_binding_host?: string | null;
    summary_language: string;
    force_llm_summary_on_merge: boolean;
    max_parallel_insert: number;
    max_async: number;
    embedding_func_max_async: number;
    embedding_batch_num: number;
    cosine_threshold: number;
    min_rerank_score: number;
    related_chunk_number: number;
  };
  update_status?: Record<string, any>;
  core_version?: string;
  api_version?: string;
  auth_mode?: "enabled" | "disabled";
  pipeline_busy: boolean;
  keyed_locks?: {
    process_id: number;
    cleanup_performed: {
      mp_cleaned: number;
      async_cleaned: number;
    };
    current_status: {
      total_mp_locks: number;
      pending_mp_cleanup: number;
      total_async_locks: number;
      pending_async_cleanup: number;
    };
  };
  webui_title?: string;
  webui_description?: string;
};

export type LightragDocumentsScanProgress = {
  is_scanning: boolean;
  current_file: string;
  indexed_count: number;
  total_files: number;
  progress: number;
};

export type QueryMode =
  | "naive"
  | "local"
  | "global"
  | "hybrid"
  | "mix"
  | "bypass";

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thinkingContent?: string;
  displayContent?: string;
  thinkingTime?: number | null;
};

export type QueryRequest = {
  query: string;
  mode: QueryMode;
  only_need_context?: boolean;
  only_need_prompt?: boolean;
  response_type?: string;
  stream?: boolean;
  top_k?: number;
  chunk_top_k?: number;
  max_entity_tokens?: number;
  max_relation_tokens?: number;
  max_total_tokens?: number;
  conversation_history?: Message[];
  history_turns?: number;
  user_prompt?: string;
  enable_rerank?: boolean;
};

// [UPDATED] Cập nhật Type QueryResponse để chứa context_data
export type QueryResponse = {
  response: string;
  references?: Array<{
    reference_id: string;
    file_path: string;
    content?: string[];
  }>;
  context_data?: {
    entities?: Array<{
      entity_name: string;
      entity_type?: string;
      description?: string;
    }>;
    relationships?: any[];
    chunks?: any[];
  };
};

export type EntityUpdateResponse = {
  status: string;
  message: string;
  data: Record<string, any>;
  operation_summary?: {
    merged: boolean;
    merge_status: "success" | "failed" | "not_attempted";
    merge_error: string | null;
    operation_status: "success" | "partial_success" | "failure";
    target_entity: string | null;
    final_entity?: string | null;
    renamed?: boolean;
  };
};

export type DocActionResponse = {
  status: "success" | "partial_success" | "failure" | "duplicated";
  message: string;
  track_id?: string;
};

export type ScanResponse = {
  status: "scanning_started";
  message: string;
  track_id: string;
};

export type ReprocessFailedResponse = {
  status: "reprocessing_started";
  message: string;
  track_id: string;
};

export type DeleteDocResponse = {
  status: "deletion_started" | "busy" | "not_allowed";
  message: string;
  doc_id: string;
};

export type DocStatus =
  | "pending"
  | "processing"
  | "preprocessed"
  | "processed"
  | "failed";

export type DocStatusResponse = {
  id: string;
  content_summary: string;
  content_length: number;
  status: DocStatus;
  created_at: string;
  updated_at: string;
  track_id?: string;
  chunks_count?: number;
  error_msg?: string;
  metadata?: Record<string, any>;
  file_path: string;
};

export type DocsStatusesResponse = {
  statuses: Record<DocStatus, DocStatusResponse[]>;
};

export type TrackStatusResponse = {
  track_id: string;
  documents: DocStatusResponse[];
  total_count: number;
  status_summary: Record<string, number>;
};

export type DocumentsRequest = {
  status_filter?: DocStatus | null;
  page: number;
  page_size: number;
  sort_field: "created_at" | "updated_at" | "id" | "file_path";
  sort_direction: "asc" | "desc";
};

export type PaginationInfo = {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type PaginatedDocsResponse = {
  documents: DocStatusResponse[];
  pagination: PaginationInfo;
  status_counts: Record<string, number>;
};

export type StatusCountsResponse = {
  status_counts: Record<string, number>;
};

export type AuthStatusResponse = {
  auth_configured: boolean;
  access_token?: string;
  token_type?: string;
  auth_mode?: "enabled" | "disabled";
  message?: string;
  core_version?: string;
  api_version?: string;
  webui_title?: string;
  webui_description?: string;
};

export type PipelineStatusResponse = {
  autoscanned: boolean;
  busy: boolean;
  job_name: string;
  job_start?: string;
  docs: number;
  batchs: number;
  cur_batch: number;
  request_pending: boolean;
  cancellation_requested?: boolean;
  latest_message: string;
  history_messages?: string[];
  update_status?: Record<string, any>;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  auth_mode?: "enabled" | "disabled";
  message?: string;
  core_version?: string;
  api_version?: string;
  webui_title?: string;
  webui_description?: string;
};

export const InvalidApiKeyError = "Invalid API Key";
export const RequireApiKeError = "API Key required";

// Axios instance
const axiosInstance = axios.create({
  baseURL: backendBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const apiKey = useSettingsStore.getState().apiKey;
  const token = localStorage.getItem("LIGHTRAG-API-TOKEN");

  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  if (apiKey) {
    config.headers["X-API-Key"] = apiKey;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      if (error.response?.status === 401) {
        if (error.config?.url?.includes("/login")) {
          throw error;
        }
        navigationService.navigateToLogin();
        return Promise.reject(new Error("Authentication required"));
      }
      throw new Error(
        `${error.response.status} ${
          error.response.statusText
        }\n${JSON.stringify(error.response.data)}\n${error.config?.url}`
      );
    }
    throw error;
  }
);

// API methods
export const queryGraphs = async (
  label: string,
  maxDepth: number,
  maxNodes: number
): Promise<LightragGraphType> => {
  const response = await axiosInstance.get(
    `/graphs?label=${encodeURIComponent(
      label
    )}&max_depth=${maxDepth}&max_nodes=${maxNodes}`
  );
  return response.data;
};

export const getGraphLabels = async (): Promise<string[]> => {
  const response = await axiosInstance.get("/graph/label/list");
  return response.data;
};

export const getPopularLabels = async (
  limit: number = popularLabelsDefaultLimit
): Promise<string[]> => {
  const response = await axiosInstance.get(
    `/graph/label/popular?limit=${limit}`
  );
  return response.data;
};

export const searchLabels = async (
  query: string,
  limit: number = searchLabelsDefaultLimit
): Promise<string[]> => {
  const response = await axiosInstance.get(
    `/graph/label/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return response.data;
};

export const checkHealth = async (): Promise<
  LightragStatus | { status: "error"; message: string }
> => {
  try {
    const response = await axiosInstance.get("/health");
    return response.data;
  } catch (error) {
    return {
      status: "error",
      message: errorMessage(error),
    };
  }
};

export const getDocuments = async (): Promise<DocsStatusesResponse> => {
  const response = await axiosInstance.get("/documents");
  return response.data;
};

export interface DocContentResponse {
  id: string;
  content: string;
  file_path?: string;
}

export const getDocumentContent = async (
  docId: string
): Promise<DocContentResponse> => {
  const response = await axiosInstance.post("/documents/content", {
    doc_id: docId,
  });
  return response.data;
};

export const scanNewDocuments = async (): Promise<ScanResponse> => {
  const response = await axiosInstance.post("/documents/scan");
  return response.data;
};

export const reprocessFailedDocuments =
  async (): Promise<ReprocessFailedResponse> => {
    const response = await axiosInstance.post("/documents/reprocess_failed");
    return response.data;
  };

export const getDocumentsScanProgress =
  async (): Promise<LightragDocumentsScanProgress> => {
    const response = await axiosInstance.get("/documents/scan-progress");
    return response.data;
  };

export const queryText = async (
  request: QueryRequest
): Promise<QueryResponse> => {
  const response = await axiosInstance.post("/query", request);
  return response.data;
};

// [UPDATED] Hàm queryTextStream mới hỗ trợ onContext callback
export const queryTextStream = async (
  request: QueryRequest,
  onChunk: (chunk: string) => void,
  onContext: (data: any) => void, // Callback mới để nhận context data
  onError?: (error: string) => void
) => {
  const apiKey = useSettingsStore.getState().apiKey;
  const token = localStorage.getItem("LIGHTRAG-API-TOKEN");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  try {
    const response = await fetch(`${backendBaseUrl}/query/stream`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      if (response.status === 401) {
        navigationService.navigateToLogin();
        throw new Error("Authentication required");
      }
      let errorBody = "Unknown error";
      try {
        errorBody = await response.text();
      } catch {
        /* ignore */
      }
      const url = `${backendBaseUrl}/query/stream`;
      throw new Error(
        `${response.status} ${response.statusText}\n${JSON.stringify({
          error: errorBody,
        })}\n${url}`
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    
    // Batching variables for smoother streaming
    let chunkBuffer = "";
    let chunkCount = 0;
    const CHUNK_BATCH_SIZE = 3; // Batch every 3 chunks to reduce UI updates

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Send any remaining buffered chunks
        if (chunkBuffer) {
          onChunk(chunkBuffer);
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);

            // Xử lý response text chunk với batching
            if (parsed.response) {
              chunkBuffer += parsed.response;
              chunkCount++;
              
              // Send batch when we have enough chunks or at significant intervals
              if (chunkCount >= CHUNK_BATCH_SIZE) {
                onChunk(chunkBuffer);
                chunkBuffer = "";
                chunkCount = 0;
              }
            }

            // [NEW] Xử lý context_data (chứa entities cho Graph)
            if (parsed.context_data) {
              onContext(parsed.context_data);
            }

            if (parsed.error && onError) {
              onError(parsed.error);
            }
          } catch (error) {
            console.error("Error parsing stream chunk:", line, error);
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.response) {
          onChunk(parsed.response);
        }
        if (parsed.context_data) {
          onContext(parsed.context_data);
        }
        if (parsed.error && onError) {
          onError(parsed.error);
        }
      } catch (error) {
        console.error("Error parsing final chunk:", buffer, error);
      }
    }
  } catch (error) {
    const message = errorMessage(error);
    if (message === "Authentication required") {
      if (onError) onError("Authentication required");
      return;
    }

    // Error handling logic (copied from original)
    if (onError) {
      onError(message);
    } else {
      console.error("Unhandled stream error:", message);
    }
  }
};

export const insertText = async (text: string): Promise<DocActionResponse> => {
  const response = await axiosInstance.post("/documents/text", { text });
  return response.data;
};

export const insertTexts = async (
  texts: string[]
): Promise<DocActionResponse> => {
  const response = await axiosInstance.post("/documents/texts", { texts });
  return response.data;
};

export const uploadDocument = async (
  file: File,
  onUploadProgress?: (percentCompleted: number) => void
): Promise<DocActionResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axiosInstance.post("/documents/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress:
      onUploadProgress !== undefined
        ? (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total!
            );
            onUploadProgress(percentCompleted);
          }
        : undefined,
  });
  return response.data;
};

export const batchUploadDocuments = async (
  files: File[],
  onUploadProgress?: (fileName: string, percentCompleted: number) => void
): Promise<DocActionResponse[]> => {
  return await Promise.all(
    files.map(async (file) => {
      return await uploadDocument(file, (percentCompleted) => {
        onUploadProgress?.(file.name, percentCompleted);
      });
    })
  );
};

export const clearDocuments = async (): Promise<DocActionResponse> => {
  const response = await axiosInstance.delete("/documents");
  return response.data;
};

export const clearCache = async (): Promise<{
  status: "success" | "fail";
  message: string;
}> => {
  const response = await axiosInstance.post("/documents/clear_cache", {});
  return response.data;
};

export const deleteDocuments = async (
  docIds: string[],
  deleteFile: boolean = false,
  deleteLLMCache: boolean = false
): Promise<DeleteDocResponse> => {
  const response = await axiosInstance.delete("/documents/delete_document", {
    data: {
      doc_ids: docIds,
      delete_file: deleteFile,
      delete_llm_cache: deleteLLMCache,
    },
  });
  return response.data;
};

export const getAuthStatus = async (): Promise<AuthStatusResponse> => {
  try {
    const response = await axiosInstance.get("/auth-status", {
      timeout: 5000,
      headers: {
        Accept: "application/json",
      },
    });

    const contentType = response.headers["content-type"] || "";
    if (contentType.includes("text/html")) {
      return {
        auth_configured: true,
        auth_mode: "enabled",
      };
    }

    if (
      response.data &&
      typeof response.data === "object" &&
      "auth_configured" in response.data &&
      typeof response.data.auth_configured === "boolean"
    ) {
      if (!response.data.auth_configured) {
        if (
          response.data.access_token &&
          typeof response.data.access_token === "string"
        ) {
          return response.data;
        }
      } else {
        return response.data;
      }
    }
    return {
      auth_configured: true,
      auth_mode: "enabled",
    };
  } catch (error) {
    return {
      auth_configured: true,
      auth_mode: "enabled",
    };
  }
};

export const getPipelineStatus = async (): Promise<PipelineStatusResponse> => {
  const response = await axiosInstance.get("/documents/pipeline_status");
  return response.data;
};

export const cancelPipeline = async (): Promise<{
  status: "cancellation_requested" | "not_busy";
  message: string;
}> => {
  const response = await axiosInstance.post("/documents/cancel_pipeline");
  return response.data;
};

export const loginToServer = async (
  username: string,
  password: string
): Promise<LoginResponse> => {
  const formData = new FormData();
  formData.append("username", username);
  formData.append("password", password);

  const response = await axiosInstance.post("/login", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const updateEntity = async (
  entityName: string,
  updatedData: Record<string, any>,
  allowRename: boolean = false,
  allowMerge: boolean = false
): Promise<EntityUpdateResponse> => {
  const response = await axiosInstance.post("/graph/entity/edit", {
    entity_name: entityName,
    updated_data: updatedData,
    allow_rename: allowRename,
    allow_merge: allowMerge,
  });
  return response.data;
};

export const updateRelation = async (
  sourceEntity: string,
  targetEntity: string,
  updatedData: Record<string, any>
): Promise<DocActionResponse> => {
  const response = await axiosInstance.post("/graph/relation/edit", {
    source_id: sourceEntity,
    target_id: targetEntity,
    updated_data: updatedData,
  });
  return response.data;
};

export const checkEntityNameExists = async (
  entityName: string
): Promise<boolean> => {
  try {
    const response = await axiosInstance.get(
      `/graph/entity/exists?name=${encodeURIComponent(entityName)}`
    );
    return response.data.exists;
  } catch (error) {
    console.error("Error checking entity name:", error);
    return false;
  }
};

export const getTrackStatus = async (
  trackId: string
): Promise<TrackStatusResponse> => {
  const response = await axiosInstance.get(
    `/documents/track_status/${encodeURIComponent(trackId)}`
  );
  return response.data;
};

export const getDocumentsPaginated = async (
  request: DocumentsRequest
): Promise<PaginatedDocsResponse> => {
  const response = await axiosInstance.post("/documents/paginated", request);
  return response.data;
};

export const getDocumentStatusCounts =
  async (): Promise<StatusCountsResponse> => {
    const response = await axiosInstance.get("/documents/status_counts");
    return response.data;
  };
