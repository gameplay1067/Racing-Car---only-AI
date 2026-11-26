export default function Home() {
  return (
    <main className="game-shell" aria-label="ULTIMATE RACING game">
      <iframe
        className="game-frame"
        src="./game/index.html"
        title="ULTIMATE RACING"
        allow="autoplay; fullscreen; gamepad"
        referrerPolicy="no-referrer"
      />
    </main>
  );
}
