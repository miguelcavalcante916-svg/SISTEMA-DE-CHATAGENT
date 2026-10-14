interface Bucket {
  count: number;
  resetAt: number;
}

/** Limitador simples em memória para tentativas de login (por IP + usuário). */
export class LoginRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxAttempts = 10,
    private readonly windowMs = 15 * 60_000,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key);
    if (!b) return false;
    if (b.resetAt <= now) {
      this.buckets.delete(key);
      return false;
    }
    return b.count >= this.maxAttempts;
  }

  registerFailure(key: string, now = Date.now()): void {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    b.count += 1;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
