export default function SearchFooter({ result }) {
  return (
    <div className="footer">
      {result.cancelled && <strong>Búsqueda cancelada: resultados parciales. </strong>}
      {result.rateLimitRemaining != null && <span>Cuota restante de GitHub: {result.rateLimitRemaining}</span>}
      {result.failures.length > 0 && (
        <details>
          <summary className="error">{result.failures.length} repos con error</summary>
          <ul>{result.failures.map(f => <li key={f.repo}>{f.repo}: {f.message}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
