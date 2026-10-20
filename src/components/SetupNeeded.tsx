export function SetupNeeded() {
  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3">
        <i className="bi bi-house-gear me-2" />
        House Hub needs a Firebase project
      </h1>
      <p>
        This build has no Firebase web config. Copy <code>env-template.txt</code> to <code>.env.local</code>, fill in
        the values from Firebase console &rsaquo; Project settings &rsaquo; Your apps, and restart{' '}
        <code>npm run dev</code>.
      </p>
      <p className="text-secondary mb-0">
        For GitHub Pages, add the same values as repository secrets (see the README).
      </p>
    </div>
  )
}
