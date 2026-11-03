import { computed, signal } from "@angular/core";

import { RedirectError } from "@/lib/api-client";

/** One line of feedback above the body of a page. `failed` picks the warning colour. */
export type Notice = { text: string; failed: boolean };

/** Hold the busy message and the notice of a page that reads and writes through the API.
 *
 * `runRequest` shows `busyText` while `run` is in flight and returns true when `run` finished, or writes the failure as a notice and returns false. It clears `busyMessage` in every case, and writes `successText` as a notice when the caller gives one.
 *
 * `reportFailure` writes one failure as a notice with no busy message. Use it in the catch of a read that runs on mount.
 *
 * Neither function writes a notice for a `RedirectError`, because the browser is already leaving the page that would show it.
 */
export class PageRequest {
  readonly notice = signal<Notice | null>(null);
  readonly busyMessage = signal("");
  readonly isBusy = computed(() => this.busyMessage() !== "");

  reportFailure(error: unknown, fallback: string): void {
    if (error instanceof RedirectError) {
      return;
    }

    this.notice.set({ text: error instanceof Error ? error.message : fallback, failed: true });
  }

  async runRequest(busyText: string, run: () => Promise<unknown>, successText?: string): Promise<boolean> {
    this.busyMessage.set(busyText);
    this.notice.set(null);
    try {
      await run();
      if (successText !== undefined) {
        this.notice.set({ text: successText, failed: false });
      }
      return true;
    } catch (error) {
      this.reportFailure(error, "The request failed.");
      return false;
    } finally {
      this.busyMessage.set("");
    }
  }
}
