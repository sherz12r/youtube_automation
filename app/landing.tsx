"use client";

export default function Landing() {
  return <main className="landing-shell">
    <nav className="landing-nav">
      <a className="landing-logo" href="#top" aria-label="Noor Studio home"><span>NS</span><strong>Noor Studio</strong></a>
      <div className="landing-links"><a href="#workflow">Workflow</a><a href="#security">Security</a><a href="#pricing">Pricing</a></div>
      <a className="nav-cta" href="/login">Sign in</a>
    </nav>

    <section className="landing-hero" id="top">
      <div className="hero-copy">
        <span className="landing-kicker"><i/> YouTube automation, with you in control</span>
        <h1>Turn your channel idea into a <em>repeatable video engine.</em></h1>
        <p>Define your niche, audience, voice, and publishing rhythm. Noor Studio researches ideas, drafts scripts, creates narration and visuals, then prepares every video for your own YouTube channel.</p>
        <div className="hero-actions"><a className="hero-primary" href="/login">Open your studio <span>→</span></a><a className="hero-secondary" href="#workflow">See how it works</a></div>
        <div className="hero-trust"><span>✓ Human approval gates</span><span>✓ Private channel credentials</span><span>✓ Isolated workspaces</span></div>
      </div>
      <div className="hero-product" aria-label="Product preview">
        <div className="preview-window">
          <div className="preview-top"><span><i/><i/><i/></span><b>noorstudio / workspace</b><em>Live</em></div>
          <div className="preview-body">
            <aside><div className="preview-logo">N</div>{["Overview","Ideas","Scripts","Videos","Publishing"].map((item,index)=><span className={index===1?"active":""} key={item}><i/>{item}</span>)}</aside>
            <section>
              <header><div><small>YOUR CHANNEL</small><strong>Stories that build trust</strong></div><button>+ Create video</button></header>
              <div className="preview-stats"><div><small>Ideas ready</small><b>24</b><em>↑ 18%</em></div><div><small>In review</small><b>3</b><em>Needs you</em></div><div><small>Published</small><b>16</b><em>This month</em></div></div>
              <div className="preview-card"><div className="video-thumb"><span>▶</span><small>08:42</small></div><div><small>NEXT IN YOUR QUEUE</small><strong>Why consistency beats virality</strong><p>Script, narration, visuals, and metadata are ready for review.</p><div><b>Script ready</b><b>Voice ready</b><b>SEO ready</b></div></div></div>
            </section>
          </div>
        </div>
        <div className="floating-card float-channel"><span>YT</span><div><small>Connected channel</small><strong>Your credentials stay private</strong></div><i>✓</i></div>
        <div className="floating-card float-progress"><small>Production progress</small><div><span style={{width:"78%"}}/></div><strong>78%</strong></div>
      </div>
    </section>

    <section className="landing-strip"><span>One focused system</span><b>Topic research</b><i>→</i><b>Script</b><i>→</i><b>Voice</b><i>→</i><b>Visuals</b><i>→</i><b>YouTube</b></section>

    <section className="landing-section workflow" id="workflow">
      <div className="section-heading"><span>THE WORKFLOW</span><h2>Your creative direction. A system that remembers it.</h2><p>Set the rules once. Review what matters. Let the repetitive production work move forward.</p></div>
      <div className="workflow-grid">
        <article><span>01</span><div className="flow-icon coral">◎</div><h3>Shape your channel</h3><p>Save your topic, target audience, language, tone, upload privacy, and publishing rhythm.</p></article>
        <article><span>02</span><div className="flow-icon violet">✦</div><h3>Build the production queue</h3><p>Generate original ideas and complete scripts guided by your channel profile—not somebody else’s.</p></article>
        <article><span>03</span><div className="flow-icon green">▶</div><h3>Review, render, publish</h3><p>Approve the story, create narration and scenes, preview the video, then upload to your channel.</p></article>
      </div>
    </section>

    <section className="security-section" id="security">
      <div className="security-visual"><div className="lock-orbit"><span>⌁</span><i/><i/><i/></div><div className="tenant-card tenant-a"><b>Workspace A</b><small>Stories · Videos · Token</small></div><div className="tenant-card tenant-b"><b>Workspace B</b><small>Stories · Videos · Token</small></div></div>
      <div className="security-copy"><span>BUILT FOR MULTI-TENANT PRIVACY</span><h2>Your channel data is yours alone.</h2><p>Every account is separated at the API, database, file, and upload-session layers. Hiding a menu is not security; server-side ownership checks are.</p><ul><li><b>Encrypted YouTube tokens</b><small>Refresh tokens are encrypted before storage and never sent back to the browser.</small></li><li><b>Tenant-scoped production data</b><small>Stories, generated videos, metadata, and upload sessions are bound to one owner.</small></li><li><b>Admin-controlled subscriptions</b><small>The main administrator controls access and renewal dates without seeing customer credentials.</small></li></ul></div>
    </section>

    <section className="landing-section pricing" id="pricing">
      <div className="section-heading"><span>SIMPLE SUBSCRIPTION ACCESS</span><h2>One studio for your entire channel workflow.</h2><p>Your administrator creates the plan and renewal date. No shared logins, no mixed channels.</p></div>
      <div className="pricing-card"><div><span>MANAGED MONTHLY</span><h3>Your plan, configured by your administrator</h3><p>Secure account · Dedicated workspace · Channel preferences · Video production · YouTube publishing</p></div><a href="/login">Sign in to your workspace <span>→</span></a></div>
    </section>

    <footer><a className="landing-logo" href="#top"><span>NS</span><strong>Noor Studio</strong></a><p>From channel strategy to publish-ready video.</p><small>© {new Date().getFullYear()} Noor Studio</small></footer>
  </main>;
}
