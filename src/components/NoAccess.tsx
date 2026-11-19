/** Shown to a signed-in user who has no role yet. */
export default function NoAccess() {
  return (
    <section className="card">
      <h1>No access yet</h1>
      <p className="alert warning" style={{ margin: 0 }}>
        You are signed in, but your account has no role. Ask your administrator to give you the uploader or approver role.
      </p>
    </section>
  );
}
