import { Component, signal, type OnInit } from "@angular/core";

import type { StartSignInResponse } from "@knowledgestack/api-contract/auth";

import { Button } from "@/components/button";
import { requestJson } from "@/lib/api-client";

@Component({
  selector: "ks-signin-page",
  host: { style: "display: contents" },
  imports: [Button],
  templateUrl: "./signin-page.html",
})
export class SignInPage implements OnInit {
  protected readonly failure = signal("");
  protected readonly isStarting = signal(false);

  ngOnInit(): void {
    // The API returns the browser here with ?error= when Google refuses or the state value does not match.
    const error = new URLSearchParams(window.location.search).get("error");
    if (error !== null) {
      this.failure.set(error);
    }
  }

  protected async startSignIn(): Promise<void> {
    this.failure.set("");
    this.isStarting.set(true);
    try {
      const body = await requestJson<StartSignInResponse>("/api/auth/google");
      window.location.assign(body.authorizeUrl);
    } catch (error) {
      this.failure.set(error instanceof Error ? error.message : "The sign-in did not start.");
      this.isStarting.set(false);
    }
  }
}
