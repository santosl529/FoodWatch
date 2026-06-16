import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <UtensilsCrossed className="size-5" />
          <span>Penn Free Food</span>
        </Link>
        <Button asChild size="sm">
          <Link href="/post/new">Post food</Link>
        </Button>
      </div>
    </header>
  );
}
