import { describe, expect, it } from "vitest";
import { playbackCommand } from "./playbackKeyboard";

describe("playback keyboard controls", () => {
  it("uses the existing one-hop step commands for arrow keys", () => {
    expect(playbackCommand("ArrowLeft", 8000)).toEqual({ kind: "step", delta: -1 });
    expect(playbackCommand("ArrowRight", 8000)).toEqual({ kind: "step", delta: 1 });
  });
  it("seeks to the beginning or end with Home and End", () => {
    expect(playbackCommand("Home", 8000)).toEqual({ kind: "seek", ms: 0 });
    expect(playbackCommand("End", 8000)).toEqual({ kind: "seek", ms: 8000 });
    expect(playbackCommand("End", 0)).toEqual({ kind: "seek", ms: 0 });
  });
  it("leaves unrelated keys to their existing handlers", () => {
    expect(playbackCommand("Tab", 8000)).toBeNull();
    expect(playbackCommand(" ", 8000)).toBeNull();
  });
});
