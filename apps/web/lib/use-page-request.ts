"use client";

import { useCallback, useState } from "react";

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
export function usePageRequest(): {
  notice: Notice | null;
  setNotice: (notice: Notice | null) => void;
  busyMessage: string;
  isBusy: boolean;
  reportFailure: (error: unknown, fallback: string) => void;
  runRequest: (busyText: string, run: () => Promise<unknown>, successText?: string) => Promise<boolean>;
} {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyMessage, setBusyMessage] = useState("");

  const reportFailure = useCallback((error: unknown, fallback: string) => {
    if (error instanceof RedirectError) {
      return;
    }

    setNotice({ text: error instanceof Error ? error.message : fallback, failed: true });
  }, []);

  const runRequest = useCallback(
    async (busyText: string, run: () => Promise<unknown>, successText?: string): Promise<boolean> => {
      setBusyMessage(busyText);
      setNotice(null);
      try {
        await run();
        if (successText !== undefined) {
          setNotice({ text: successText, failed: false });
        }
        return true;
      } catch (error) {
        reportFailure(error, "The request failed.");
        return false;
      } finally {
        setBusyMessage("");
      }
    },
    [reportFailure],
  );

  return {
    notice,
    setNotice,
    busyMessage,
    isBusy: busyMessage !== "",
    reportFailure,
    runRequest,
  };
}
