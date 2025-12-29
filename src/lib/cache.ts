// Simple in-memory cache để tránh fetch lại data không cần thiết
interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresIn: number // milliseconds
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>()

  set<T>(key: string, data: T, expiresIn = 30000) {
    // Default 30 giây
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn,
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const isExpired = Date.now() - entry.timestamp > entry.expiresIn
    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  invalidate(key: string) {
    this.cache.delete(key)
  }

  invalidatePattern(pattern: string) {
    // Xóa tất cả keys match pattern
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
      }
    }
  }

  clear() {
    this.cache.clear()
  }
}

export const cache = new SimpleCache()

// Cache keys
export const CACHE_KEYS = {
  classes: 'classes:all',
  myClass: (userId: string) => `classes:my:${userId}`,
  assignedExams: (userId: string) => `exams:assigned:${userId}`,
  attempts: (userId: string) => `attempts:${userId}`,
  exam: (examId: string) => `exam:${examId}`,
  subjects: 'subjects:all',
}

