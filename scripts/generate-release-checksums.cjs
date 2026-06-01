const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const releaseDir = path.join(rootDir, "release");
const outputPath = path.join(releaseDir, "SHA256SUMS.txt");
const artifactPattern = /\.(?:AppImage|deb|dmg|exe|zip|yml)$/i;
const privateArtifacts = new Set(["builder-debug.yml"]);
const minimumArtifactBytes = {
  ".appimage": 10 * 1024 * 1024,
  ".deb": 10 * 1024 * 1024,
  ".dmg": 10 * 1024 * 1024,
  ".exe": 10 * 1024 * 1024,
  ".zip": 10 * 1024 * 1024,
  ".yml": 80,
};

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(releaseDir)) {
  fail("Missing release/. Run a package script before generating checksums.");
}

const files = fs
  .readdirSync(releaseDir)
  .filter((name) => artifactPattern.test(name))
  .filter((name) => !privateArtifacts.has(name))
  .filter((name) => fs.statSync(path.join(releaseDir, name)).isFile())
  .sort();

if (!files.length) {
  fail("No release artifacts found for checksum generation.");
}

files.forEach((name) => {
  const fullPath = path.join(releaseDir, name);
  const extension = path.extname(name).toLowerCase();
  const minimumBytes = name.includes("-Swift-") ? 250 * 1024 : minimumArtifactBytes[extension] ?? 1;
  const size = fs.statSync(fullPath).size;
  if (size < minimumBytes) {
    fail(
      `${name} is only ${size} bytes. Refusing to publish a checksum for an invalid or truncated release artifact.`,
    );
  }
});

const lines = files.map((name) => {
  const fullPath = path.join(releaseDir, name);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
  const publishedName = name.endsWith(".exe") ? name.replace(/\s+/g, ".") : name;
  return `${hash}  ${publishedName}`;
});

fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
console.log(`Wrote ${path.relative(rootDir, outputPath)} with ${files.length} artifact checksums.`);
