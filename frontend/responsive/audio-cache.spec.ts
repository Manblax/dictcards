import { expect, test } from "@playwright/test";

// A short, valid silent PCM recording exercises real Blob URL playback.
function recording() {
  const wav = Buffer.alloc(44 + 1600);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(1600, 40);
  return wav;
}

test("reuses transcription lookup and audio across replay and study navigation until refresh", async ({ page }) => {
  await page.context().addCookies([{ name: "token", value: "responsive-test", url: "http://127.0.0.1:3100" }]);
  await page.addInitScript(() => {
    localStorage.setItem("token", "responsive-test");
    localStorage.setItem("user", JSON.stringify({ id: "test", username: "tester", email: "test@example.com" }));
    localStorage.setItem("preferred-pronunciation-variant", "uk");
  });
  let lookups = 0;
  let downloads = 0;
  let speech = 0;
  await page.route("**/dictionary/lookup?**", route => {
    const word = new URL(route.request().url()).searchParams.get("word");
    if (word === "carry on") lookups++;
    return route.fulfill({ json: {
      word, normalizedWord: word, definitions: [], ipa: { uk: "/ˌkæri ˈɒn/" },
      audio: { uk: "/dictionary/audio/carry-on-uk", us: "/dictionary/audio/carry-on-us" }, cached: true,
    } });
  });
  await page.route("**/dictionary/audio/**", route => {
    downloads++;
    return route.fulfill({ contentType: "audio/wav", body: recording() });
  });
  await page.route("**/tts", route => {
    speech++;
    return route.fulfill({ contentType: "audio/wav", body: recording() });
  });

  await page.goto("/module/responsive");
  const row = page.locator(".module-term-body").first();
  await row.scrollIntoViewIfNeeded();
  await expect(row.getByLabel("UK транскрипция", { exact: true })).toBeVisible();
  expect(lookups).toBe(1);
  expect(downloads).toBe(0);
  const uk = row.getByRole("button", { name: "Воспроизвести UK произношение: carry on", exact: true });
  await uk.click();
  await expect.poll(() => downloads).toBe(1);
  await expect(uk).toBeEnabled();
  await uk.click();
  await expect(uk).toBeEnabled();
  expect(downloads).toBe(1);

  await page.locator(".study-modes").getByRole("link", { name: "card", exact: true }).click();
  const cardAudio = page.getByRole("button", { name: "Воспроизвести произношение", exact: true });
  await cardAudio.click();
  await expect(cardAudio).toBeEnabled();
  expect(downloads).toBe(1);
  expect(lookups).toBe(1);
  expect(speech).toBe(0);

  await page.getByRole("link", { name: "Назад к модулю", exact: true }).click();
  await uk.click();
  await expect(uk).toBeEnabled();
  expect(downloads).toBe(1);
  expect(lookups).toBe(1);
  await row.getByRole("button", { name: "Воспроизвести US произношение: carry on", exact: true }).click();
  await expect.poll(() => downloads).toBe(2);

  await page.reload();
  await uk.click();
  await expect.poll(() => downloads).toBe(3);
  expect(lookups).toBe(2);
  expect(speech).toBe(0);
});
