"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { AuthorizationUrlResponse } from "@knowledgestack/shared/auth";
import type { ErrorResponse } from "@knowledgestack/shared/http";

import styles from "./signin.module.css";

export default function SignInPage(): ReactNode {
  const [failure, setFailure] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    // The API returns the browser here with ?error= when Google refuses or the state value does not match.
    const error = new URLSearchParams(window.location.search).get("error");
    if (error !== null) {
      setFailure(error);
    }
  }, []);

  const startSignIn = async () => {
    setFailure("");
    setIsStarting(true);
    try {
      const response = await fetch("/api/auth/google");
      const body = (await response.json()) as Partial<
        AuthorizationUrlResponse & ErrorResponse
      >;
      if (!response.ok || body.authorizeUrl === undefined) {
        throw new Error(body.message ?? "The API returned no Google sign-in URL.");
      }
      window.location.assign(body.authorizeUrl);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The sign-in did not start.");
      setIsStarting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <section className={styles.intro}>
          <h1 className={styles.title}>
            Find the answer.
            <span>Check the source.</span>
          </h1>
          <p className={styles.description}>
            Ask a question across the documents in your workspace. Open any citation to read the
            exact chunk.
          </p>

          <div className={styles.auth}>
            {failure === "" ? null : (
              <p className={styles.failure} role="alert">
                {failure}
              </p>
            )}

            <button
              type="button"
              className={`button ${styles.googleButton}`}
              onClick={startSignIn}
              disabled={isStarting}
              aria-busy={isStarting}
            >
              <svg className={styles.googleMark} viewBox="0 0 18 18" aria-hidden="true">
                <path
                  fill="#4285f4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
                />
                <path
                  fill="#34a853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
                />
                <path
                  fill="#fbbc05"
                  d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
                />
                <path
                  fill="#ea4335"
                  d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
                />
              </svg>
              {isStarting ? "Opening Google" : "Continue with Google"}
            </button>
            <p className={styles.nextStep}>Create a workspace or join one after sign-in.</p>
          </div>
        </section>

        <aside className={styles.example} aria-label="Product example">
          <p className={styles.question}>What changed in the renewal terms?</p>
          <p className={styles.answer}>
            The renewal window moved from 30 to 45 days.
            <span className={styles.answerCitation}>1</span>
          </p>

          <figure className={styles.source}>
            <div className={styles.sourceHeader}>
              <span className={styles.sourceIndex}>1</span>
              <div>
                <h2 className={styles.sourceTitle}>Vendor agreement</h2>
                <p className={styles.sourceLocation}>Renewal terms · Section 4</p>
              </div>
            </div>
            <blockquote className={styles.chunk}>
              The customer may renew the agreement by giving written notice at least 45 days
              before the current term ends.
            </blockquote>
          </figure>
        </aside>
      </div>
    </div>
  );
}
