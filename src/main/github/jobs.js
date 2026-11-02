const controllers = new Map()

/**
 * Runs a long GitHub search, reporting progress to the renderer on 'job:progress'.
 * fn receives (signal, progress) where progress(done, total) emits an update.
 */
export async function runJob(webContents, jobId, fn) {
  const controller = new AbortController()
  controllers.set(jobId, controller)
  const progress = (done, total) => {
    if (!webContents.isDestroyed()) webContents.send('job:progress', { jobId, done, total })
  }
  try {
    return await fn(controller.signal, progress)
  } finally {
    controllers.delete(jobId)
  }
}

export function cancelJob(jobId) {
  controllers.get(jobId)?.abort()
}
