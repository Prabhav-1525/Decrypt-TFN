export default function ExternalLinksTab({ toolConfig }) {
  const links = toolConfig?.externalLinks || [];

  return (
    <div className="external-links">
      {toolConfig?.isInspectPuzzle && toolConfig?.isolatedUrl && (
        <article className="link-card inspect-card">
          <div>
            <h3>Open Challenge Page</h3>
            <p className="muted">Opens the isolated puzzle URL. Use F12 / DevTools freely on the opened page.</p>
          </div>
          <a
            className="btn btn-primary"
            href={toolConfig.isolatedUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Challenge
          </a>
        </article>
      )}
      {links.map((link) => (
        <article key={link.url} className="link-card">
          <div>
            <h3>{link.name}</h3>
            <p className="muted">{link.desc}</p>
          </div>
          <a className="btn btn-outline" href={link.url} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </article>
      ))}
    </div>
  );
}
