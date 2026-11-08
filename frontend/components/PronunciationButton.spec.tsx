import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DICTIONARY_SOURCE_SETTING_KEY } from "@/lib/dictionary-settings";
import PronunciationButton from "./PronunciationButton";

const { play, usePronunciation } = vi.hoisted(() => ({
  play: vi.fn(),
  usePronunciation: vi.fn(),
}));
vi.mock("@/hooks/usePronunciation", () => ({ usePronunciation }));

function response(ipa: { uk?: string; us?: string } = {}) {
  return new Response(JSON.stringify({ ipa, audio: {} }));
}

describe("list transcription", () => {
  beforeEach(() => {
    play.mockReset();
    usePronunciation.mockReset().mockReturnValue({ play, status: "idle", message: null });
    vi.stubGlobal("IntersectionObserver", undefined);
  });

  it("does not fetch or display transcription by default", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<PronunciationButton term="work" />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/транскрипция/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it.each(["cambridge", "oxford"])("loads both accents from %s without playing audio", async (source) => {
    localStorage.setItem(DICTIONARY_SOURCE_SETTING_KEY, source);
    const fetch = vi.fn().mockResolvedValue(response({ uk: " /wɜːk/ ", us: "wɝːk" }));
    vi.stubGlobal("fetch", fetch);
    render(<PronunciationButton term="work" showTranscription />);

    expect(await screen.findByLabelText("UK транскрипция")).toHaveTextContent("/wɜːk/");
    expect(screen.getByLabelText("US транскрипция")).toHaveTextContent("/wɝːk/");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("source")).toBe(source);
    expect(play).not.toHaveBeenCalled();
    for (const accent of ["UK", "US"]) {
      const button = screen.getByRole("button", { name: `Воспроизвести ${accent} произношение: work` });
      expect(button).not.toHaveTextContent(/w[ɜɝ]/);
      fireEvent.click(button);
    }
    expect(play).toHaveBeenCalledTimes(2);
    expect(usePronunciation).toHaveBeenCalledWith("work", { mode: "exact", variant: "uk" });
    expect(usePronunciation).toHaveBeenCalledWith("work", { mode: "exact", variant: "us" });
  });

  it("waits until near the viewport and requests both accents only once", async () => {
    let intersect!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    const observe = vi.fn();
    const observer = { disconnect, observe };
    vi.stubGlobal("IntersectionObserver", vi.fn((callback) => {
      intersect = callback;
      return observer;
    }));
    const fetch = vi.fn().mockResolvedValue(response({ uk: "/rʌn/" }));
    vi.stubGlobal("fetch", fetch);
    const { unmount } = render(<PronunciationButton term="run" showTranscription />);
    expect(observe).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    act(() => {
      intersect([{ isIntersecting: false }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver);
    });
    expect(fetch).not.toHaveBeenCalled();
    act(() => {
      for (let i = 0; i < 2; i++) {
        intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver);
      }
    });
    expect(await screen.findByLabelText("UK транскрипция")).toHaveTextContent("/rʌn/");
    expect(fetch).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it.each([{ uk: "/rʌn/" }, { us: "/rʌn/" }, {}, { uk: " / / ", us: " " }])(
    "omits unavailable accents for %j and keeps both audio controls", async (ipa) => {
      const fetch = vi.fn().mockResolvedValue(response(ipa));
      vi.stubGlobal("fetch", fetch);
      await act(async () => { render(<PronunciationButton term="run" showTranscription />); });
      for (const accent of ["uk", "us"] as const) {
        const transcription = screen.queryByLabelText(`${accent.toUpperCase()} транскрипция`);
        if (ipa[accent] === "/rʌn/") expect(transcription).toHaveTextContent("/rʌn/");
        else expect(transcription).not.toBeInTheDocument();
      }
      expect(screen.getAllByRole("button")).toHaveLength(2);
    },
  );

  it("silently omits failed lookups without retrying another dictionary", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Unavailable"));
    vi.stubGlobal("fetch", fetch);
    await act(async () => { render(<PronunciationButton term="work" showTranscription />); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/транскрипция/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("ignores stale responses after term changes and hides data when disabled", async () => {
    let resolveOld!: (value: Response) => void;
    const fetch = vi.fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response({ uk: "/wɜːk/" }));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<PronunciationButton term="run" showTranscription />);
    expect(screen.queryByLabelText(/транскрипция/)).not.toBeInTheDocument();
    rerender(<PronunciationButton term="work" showTranscription />);
    expect(await screen.findByLabelText("UK транскрипция")).toHaveTextContent("/wɜːk/");
    await act(async () => { resolveOld(response({ uk: "/rʌn/" })); });
    expect(screen.getByLabelText("UK транскрипция")).toHaveTextContent("/wɜːk/");
    rerender(<PronunciationButton term="work" />);
    expect(screen.queryByLabelText(/транскрипция/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("can unmount with a pending lookup", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; })));
    const { unmount } = render(<PronunciationButton term="run" showTranscription />);
    unmount();
    await act(async () => { resolve(response({ uk: "/rʌn/" })); });
    await waitFor(() => expect(screen.queryByLabelText(/транскрипция/)).not.toBeInTheDocument());
  });
});
