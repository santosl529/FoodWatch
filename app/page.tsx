import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Penn Free Food
          </h1>
          <p className="text-muted-foreground">
            Find and share leftover free food on campus before it&apos;s thrown
            out — with trustworthy, crowd-sourced live availability.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Project scaffold
              <Badge variant="secondary">Step 1 · Foundation</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Next.js (App Router) + strict TypeScript + Tailwind + shadcn/ui are
            wired up, with Supabase client/server helpers and session middleware
            ready. Next up: schema &amp; RLS, then email-OTP auth.
          </CardContent>
        </Card>
      </main>
    </>
  );
}
