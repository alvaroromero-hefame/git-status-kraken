import { useEffect, useRef, useState } from 'react'

/** Runs a main-process search job with progress and cancel. start(invoke) where invoke(jobId) returns the IPC promise. */
export function useJob() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const jobId = useRef(null)

  useEffect(() => window.api.gh.onProgress(p => {
    if (p.jobId === jobId.current) setProgress(p)
  }), [])

  async function start(invoke) {
    jobId.current = crypto.randomUUID()
    setRunning(true)
    setProgress(null)
    try {
      return await invoke(jobId.current)
    } finally {
      setRunning(false)
      jobId.current = null
    }
  }

  const cancel = () => {
    if (jobId.current) window.api.gh.cancel(jobId.current)
  }

  return { running, progress, start, cancel }
}
