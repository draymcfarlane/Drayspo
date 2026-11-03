import { LiquidBlock, LiquidText } from "./Liquid";
import { useAppReady } from "@/lib/app-ready";
import { TypedHeading } from "./TypedHeading";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowUpRight, PenLine, X } from "lucide-react";
import { useConfig } from "@/config/ConfigProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { sortThoughts, thoughtDate, thoughtReadMinutes, type Thought } from "@/lib/thoughts";

// Card preview of a single post.
function PostSummary({ post }: { post: Thought }) {
  return (
    <>
      <p className="post-meta">
        {thoughtDate(post.date)} · {thoughtReadMinutes(post)} min read
      </p>
      <h3>{post.title}</h3>
      <p className="post-excerpt">{post.excerpt}</p>
      <span className="note-action">
        Read post <ArrowUpRight size={16} />
      </span>
    </>
  );
}

// Notebook-style post list with a hash-addressable reading dialog.
export function Thoughts() {
  const { config, intensity } = useConfig();
  const ready = useAppReady();
  const liveIntensity = ready ? intensity : 0;
  const { latest, previous, all } = sortThoughts(config.content.thoughts);
  const [view, setView] = useState<Thought | "all" | "empty" | null>(null);
  const [origin, setOrigin] = useState("all");
  const returnFocus = useRef<HTMLElement | null>(null);
  const hash = (value: string) =>
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${value}`,
    );
  const open = (post: Thought | "all" | "empty", source: string) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOrigin(source);
    setView(post);
    hash(typeof post === "object" ? `#thoughts/${encodeURIComponent(post.id)}` : "#thoughts");
  };
  useEffect(() => {
    const read = () => {
      const match = window.location.hash.match(/^#thoughts\/(.+)$/);
      if (!match?.[1]) return;
      let id: string;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        return;
      }
      const post = config.content.thoughts.find((p) => p.id === id);
      if (post) {
        setOrigin(`post-${post.id}`);
        setView(post);
        document.getElementById("thoughts")?.scrollIntoView({ behavior: "auto" });
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [config.content.thoughts]);
  const close = () => {
    setView(null);
    hash("#thoughts");
  };
  return (
    <LayoutGroup id="notebook">
      <section
        id="thoughts"
        className="section personal-section thoughts-section"
        data-motion={ready && intensity > 0}
        aria-labelledby="thoughts-h"
      >
        <div className="thoughts-heading">
          <div>
            <LiquidText className="eyebrow mb-3" text="Notebook" />
            <TypedHeading id="thoughts-h" text="Thoughts" />
          </div>
          <LiquidText text="Short posts on what I’m building and learning." delay={200} />
        </div>
        <div className="notebook-grid">
          <LiquidBlock index={0} className="h-full"><motion.div className="note-float note-previous h-full">
            <Button
              variant="ghost"
              className="notebook-card"
              onClick={() =>
                open(previous ?? "empty", previous ? `post-${previous.id}` : "previous")
              }
            >
              <motion.div
                {...(liveIntensity ? { layoutId: previous ? `post-${previous.id}` : "previous" } : {})}
                className="note-inner"
              >
                <p className="eyebrow">Previous</p>
                {previous ? (
                  <PostSummary post={previous} />
                ) : (
                  <div className="note-placeholder">
                    <div className="shimmer" />
                    <div className="shimmer" />
                    <p>No earlier posts yet</p>
                  </div>
                )}
              </motion.div>
            </Button>
          </motion.div></LiquidBlock>
          <LiquidBlock index={1} className="h-full"><motion.div className="note-float note-latest h-full">
            <Button
              variant="ghost"
              className="notebook-card latest-card"
              onClick={() => open(latest ?? "empty", latest ? `post-${latest.id}` : "latest")}
            >
              <motion.div
                {...(liveIntensity ? { layoutId: latest ? `post-${latest.id}` : "latest" } : {})}
                className="note-inner"
              >
                <p className="eyebrow">Latest</p>
                {latest ? (
                  <PostSummary post={latest} />
                ) : (
                  <div className="empty-note">
                    <PenLine size={32} />
                    <h3>No thoughts posted yet</h3>
                    <p>The first post is on its way. Check back soon.</p>
                  </div>
                )}
              </motion.div>
            </Button>
          </motion.div></LiquidBlock>
          <LiquidBlock index={2} className="h-full"><motion.div className="note-float note-all h-full">
            <Button variant="ghost" className="notebook-card" onClick={() => open("all", "all")}>
              <motion.div {...(liveIntensity ? { layoutId: "all" } : {})} className="note-inner">
                <p className="eyebrow">All posts</p>
                <h3>
                  {all.length} {all.length === 1 ? "post" : "posts"}
                </h3>
                <div className="note-pile">
                  {all.slice(0, 3).map((p) => (
                    <span key={p.id}>{p.title}</span>
                  ))}
                </div>
                <span className="note-action">
                  Browse all <ArrowUpRight size={16} />
                </span>
              </motion.div>
            </Button>
          </motion.div></LiquidBlock>
        </div>
        <Dialog
          open={view !== null}
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <AnimatePresence>
            {view !== null && (
              <DialogPortal forceMount>
                <DialogPrimitive.Overlay asChild forceMount>
                  <motion.div
                    className="thought-backdrop"
                    initial={liveIntensity ? { opacity: 0, backdropFilter: "blur(0px)" } : false}
                    animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: liveIntensity ? 0.25 : 0 }}
                  />
                </DialogPrimitive.Overlay>
                <DialogPrimitive.Content
                  asChild
                  forceMount
                  onCloseAutoFocus={(e) => {
                    if (returnFocus.current) {
                      e.preventDefault();
                      returnFocus.current.focus();
                    }
                  }}
                >
                  <motion.div
                    className="thought-modal"
                    {...(liveIntensity
                      ? { layoutId: typeof view === "object" ? `post-${view.id}` : origin }
                      : {})}
                    transition={{ duration: liveIntensity ? 0.4 : 0 }}
                  >
                    <DialogClose asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="thought-close"
                        aria-label="Close post"
                      >
                        <X />
                      </Button>
                    </DialogClose>
                    {typeof view === "object" ? (
                      <>
                        <Button
                          variant="ghost"
                          className="mb-6"
                          onClick={() => {
                            setView("all");
                            setOrigin("all");
                            hash("#thoughts");
                          }}
                        >
                          <ArrowLeft />
                          All posts
                        </Button>
                        <p className="post-meta">
                          {thoughtDate(view.date)} · {thoughtReadMinutes(view)} min read
                        </p>
                        <DialogTitle className="thought-modal-title">{view.title}</DialogTitle>
                        <DialogDescription className="sr-only">{view.excerpt}</DialogDescription>
                        <div className="flex flex-wrap gap-2 my-5">
                          {view.tags?.map((tag) => (
                            <span className="tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="thought-body">
                          {view.body
                            .split(/\n\s*\n/)
                            .filter(Boolean)
                            .map((p, i) => (
                              <p key={i}>{p}</p>
                            ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <DialogTitle className="thought-modal-title">
                          {view === "all" ? "All posts" : "Thoughts"}
                        </DialogTitle>
                        <DialogDescription className="mb-8">
                          {all.length && view === "all"
                            ? "Notes on building and learning."
                            : "No thoughts posted yet. The first post is on its way."}
                        </DialogDescription>
                        {view === "all" && (
                          <div className="all-posts-grid">
                            {all.map((post) => (
                              <Button
                                key={post.id}
                                variant="ghost"
                                className="notebook-card"
                                onClick={() => {
                                  setView(post);
                                  hash(`#thoughts/${encodeURIComponent(post.id)}`);
                                }}
                              >
                                <motion.div
                                  className="note-inner"
                                  {...(liveIntensity ? { layoutId: `post-${post.id}` } : {})}
                                >
                                  <PostSummary post={post} />
                                </motion.div>
                              </Button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                </DialogPrimitive.Content>
              </DialogPortal>
            )}
          </AnimatePresence>
        </Dialog>
      </section>
    </LayoutGroup>
  );
}
