export type Board = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

export type BoardColumn = {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
};

export type Task = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CurrentUser = {
  user_id: string;
  email: string | null;
  role: string | null;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function normalizeToken(token?: string): string | undefined {
  if (!token) return undefined;
  const trimmed = token.trim();
  if (!trimmed) return undefined;
  // Just remove Bearer and trim. Avoid stripping characters as it might break some JWTs.
  return trimmed.replace(/^Bearer\s+/i, "").trim() || undefined;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = normalizeToken(options.token);

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    if (!text) {
      throw new Error(`Request failed with ${response.status}`);
    }

    let parsedDetail: string | null = null;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      parsedDetail = typeof parsed.detail === "string" ? parsed.detail : null;
    } catch {
      parsedDetail = null;
    }

    if (parsedDetail) {
      const error = new Error(parsedDetail);
      (error as any).status = response.status;
      throw error;
    }

    const error = new Error(text);
    (error as any).status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function listBoards(token: string): Promise<Board[]> {
  return request<Board[]>("/boards", { token });
}

export function createBoard(name: string, token: string): Promise<Board> {
  return request<Board>("/boards", { method: "POST", token, body: { name } });
}

export function listColumns(boardId: string, token: string): Promise<BoardColumn[]> {
  return request<BoardColumn[]>(`/boards/${boardId}/columns`, { token });
}

export function createColumn(
  boardId: string,
  body: { title: string; position: number },
  token: string,
): Promise<BoardColumn> {
  return request<BoardColumn>(`/boards/${boardId}/columns`, {
    method: "POST",
    token,
    body,
  });
}

export function listTasks(boardId: string, token: string): Promise<Task[]> {
  return request<Task[]>(`/boards/${boardId}/tasks`, { token });
}

export function createTask(
  boardId: string,
  body: {
    column_id: string;
    title: string;
    description?: string;
    position?: number;
    status?: string;
  },
  token: string,
): Promise<Task> {
  return request<Task>(`/boards/${boardId}/tasks`, {
    method: "POST",
    token,
    body,
  });
}

export function moveTask(
  boardId: string,
  taskId: string,
  body: { column_id: string; position: number; status: string },
  token: string,
): Promise<Task> {
  return request<Task>(`/boards/${boardId}/tasks/${taskId}`, {
    method: "PATCH",
    token,
    body,
  });
}

export function editTask(
  boardId: string,
  taskId: string,
  body: { title?: string; description?: string },
  token: string,
): Promise<Task> {
  return request<Task>(`/boards/${boardId}/tasks/${taskId}/edit`, {
    method: "PATCH",
    token,
    body,
  });
}

export function deleteTask(
  boardId: string,
  taskId: string,
  token: string,
): Promise<void> {
  return request<void>(`/boards/${boardId}/tasks/${taskId}`, {
    method: "DELETE",
    token,
  });
}

export function getBreakdown(
  boardId: string,
  prompt: string,
  token: string,
): Promise<Task[]> {
  return request<Task[]>(`/boards/${boardId}/tasks/breakdown`, {
    method: "POST",
    token,
    body: { prompt },
  });
}

export function clearColumnTasks(
  boardId: string,
  columnId: string,
  token: string,
): Promise<void> {
  return request<void>(`/boards/${boardId}/columns/${columnId}/tasks/clear`, {
    method: "DELETE",
    token,
  });
}

export function getCurrentUser(token: string): Promise<CurrentUser> {
  return request<CurrentUser>("/auth/me", { token });
}
