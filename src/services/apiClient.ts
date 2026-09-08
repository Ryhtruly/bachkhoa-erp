/**
 * ApiClient - Core network client with async/await, configurable base URL,
 * error handling, and support for switching between local JSON and remote REST APIs.
 */

export interface ApiClientConfig {
  baseUrl: string;
  useLocalJson: boolean;
  simulatedDelayMs: number;
}

// Default configuration: reads from local JSON file by default, ready for live API
const DEFAULT_CONFIG: ApiClientConfig = {
  baseUrl: (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) || '/data',
  useLocalJson: true,
  simulatedDelayMs: 250, // Realistic asynchronous delay for smooth transitions
};

class ApiClient {
  private config: ApiClientConfig;

  constructor(config: Partial<ApiClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public setConfig(newConfig: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): ApiClientConfig {
    return { ...this.config };
  }

  /**
   * Helper to simulate network latency for local testing
   */
  private async delay(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Asynchronous GET request
   */
  public async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    if (this.config.simulatedDelayMs > 0) {
      await this.delay(this.config.simulatedDelayMs);
    }

    const url = this.config.useLocalJson
      ? (endpoint.startsWith('/') ? endpoint : `/data/${endpoint}`)
      : `${this.config.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options?.headers || {}),
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(
          `Network error: ${response.status} ${response.statusText} at ${url}`
        );
      }

      const data: T = await response.json();
      return data;
    } catch (error) {
      console.error(`[ApiClient.get] Failed fetching ${url}:`, error);
      throw error;
    }
  }

  /**
   * Asynchronous POST request
   */
  public async post<T, B = unknown>(
    endpoint: string,
    body: B,
    options?: RequestInit
  ): Promise<T> {
    if (this.config.simulatedDelayMs > 0) {
      await this.delay(this.config.simulatedDelayMs);
    }

    if (this.config.useLocalJson) {
      // In local mode, we emulate the server POST response
      return { success: true, data: body } as unknown as T;
    }

    const url = `${this.config.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
      body: JSON.stringify(body),
      ...options,
    });

    if (!response.ok) {
      throw new Error(`POST request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Asynchronous PATCH/PUT request
   */
  public async patch<T, B = unknown>(
    endpoint: string,
    body: B,
    options?: RequestInit
  ): Promise<T> {
    if (this.config.simulatedDelayMs > 0) {
      await this.delay(this.config.simulatedDelayMs);
    }

    if (this.config.useLocalJson) {
      return { success: true, data: body } as unknown as T;
    }

    const url = `${this.config.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
      body: JSON.stringify(body),
      ...options,
    });

    if (!response.ok) {
      throw new Error(`PATCH request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();
