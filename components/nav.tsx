import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";

import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `display_name` is defaulted to the email local-part by the handle_new_user
  // trigger, so it is normally set; fall back anyway rather than render blank.
  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    displayName =
      profile?.display_name ?? user.email?.split("@")[0] ?? "Account";
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <UtensilsCrossed className="size-5" />
          <span>Penn Free Food</span>
        </Link>

        {user ? (
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/post/new">Post food</Link>
            </Button>
            <UserMenu
              displayName={displayName ?? "Account"}
              email={user.email ?? ""}
            />
          </div>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/signin">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
