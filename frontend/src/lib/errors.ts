export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: string[]) { super(message); }
}
