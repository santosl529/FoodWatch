"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import {
  initialSignInState,
  sendOtp,
  verifyOtp,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isPennEmail } from "@/lib/auth/penn-email";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}

/**
 * The two-step flow itself. Kept separate from `SignInCard` so that "use a
 * different email" can remount it via `key`, which is the simplest way to
 * clear `useActionState` state — the hook has no reset.
 */
function SignInFlow({ onRestart }: { onRestart: () => void }) {
  const [sendState, sendAction] = useActionState(sendOtp, initialSignInState);
  const [verifyState, verifyAction] = useActionState(
    verifyOtp,
    initialSignInState,
  );

  // Cosmetic only — the Supabase auth hook is the enforcing layer.
  const [email, setEmail] = useState("");
  const showDomainHint = email.length > 0 && !isPennEmail(email);

  if (!sendState.sentTo) {
    return (
      <form action={sendAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Penn email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="you@upenn.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {showDomainHint ? (
            <p className="text-muted-foreground text-sm">
              Penn Free Food is open to Penn students — use your @upenn.edu
              address.
            </p>
          ) : null}
        </div>

        <ErrorText message={sendState.error} />
        <SubmitButton>Send code</SubmitButton>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={sendState.sentTo} />

      <div className="text-muted-foreground flex items-start gap-2 text-sm">
        <MailCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          We sent a 6-digit code to{" "}
          <span className="text-foreground font-medium">
            {sendState.sentTo}
          </span>
          .
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="token">Verification code</Label>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={6}
          pattern="\d{6}"
          placeholder="123456"
          className="text-center text-lg tracking-[0.5em]"
        />
      </div>

      <ErrorText message={verifyState.error} />
      <SubmitButton>Verify and continue</SubmitButton>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRestart}
        className="text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Use a different email
      </Button>
    </form>
  );
}

export function SignInCard() {
  const [flowKey, setFlowKey] = useState(0);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          No password needed — we&apos;ll email you a 6-digit code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInFlow
          key={flowKey}
          onRestart={() => setFlowKey((key) => key + 1)}
        />
      </CardContent>
    </Card>
  );
}
