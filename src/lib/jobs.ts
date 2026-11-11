import { db } from "./db";

export type JobHandler = (payload: any) => Promise<any>;

const HANDLERS: Record<string, JobHandler> = {};

/**
 * Register a handler for a specific job type.
 */
export function registerJobHandler(type: string, handler: JobHandler) {
  HANDLERS[type] = handler;
}

/**
 * Main worker loop to process jobs.
 */
export async function runWorker(workerId: string = "default-worker") {
  console.log(`Worker ${workerId} started.`);
  
  while (true) {
    try {
      const job = await db.job.findFirst({
        where: {
          status: "pending",
          runAt: { lte: new Date() },
        },
        orderBy: { runAt: "asc" },
      });

      if (!job) {
        await new Promise((r) => setTimeout(r, 5000)); // Wait 5s if no jobs
        continue;
      }

      // Claim the job with a lease
      const claimed = await db.job.updateMany({
        where: { 
          id: job.id, 
          status: "pending" 
        },
        data: {
          status: "in_progress",
          lockedAt: new Date(),
          lockedBy: workerId,
          attempts: { increment: 1 },
        },
      });

      if (claimed.count === 0) continue; // Someone else grabbed it

      console.log(`[${workerId}] Processing job ${job.id} (${job.type})`);

      const handler = HANDLERS[job.type];
      if (!handler) {
        await db.job.update({
          where: { id: job.id },
          data: { 
            status: "failed", 
            error: `No handler registered for job type: ${job.type}` 
          },
        });
        continue;
      }

      try {
        const result = await handler(JSON.parse(job.payload));
        await db.job.update({
          where: { id: job.id },
          data: { 
            status: "complete", 
            result: JSON.stringify(result),
            error: null 
          },
        });
        console.log(`[${workerId}] Job ${job.id} completed.`);
      } catch (error: any) {
        const isLastAttempt = job.attempts + 1 >= job.maxRetries;
        const nextRun = new Date(Date.now() + 1000 * 60 * Math.pow(2, job.attempts)); // Exponential backoff
        
        await db.job.update({
          where: { id: job.id },
          data: {
            status: isLastAttempt ? "failed" : "pending",
            error: error.message || "Unknown error",
            runAt: isLastAttempt ? job.runAt : nextRun,
            lockedAt: null,
            lockedBy: null,
          },
        });
        console.error(`[${workerId}] Job ${job.id} failed: ${error.message}`);
      }
    } catch (error) {
      console.error(`[${workerId}] Worker loop error:`, error);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * Enqueue a new job for processing.
 */
export async function enqueueJob(
  type: string, 
  payload: any, 
  options: { runAt?: Date; maxRetries?: number } = {}
) {
  return db.job.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      runAt: options.runAt ?? new Date(),
      maxRetries: options.maxRetries ?? 3,
    },
  });
}
