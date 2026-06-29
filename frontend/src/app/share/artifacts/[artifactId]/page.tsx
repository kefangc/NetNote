"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtifactDetail } from "@/components/ArtifactViews";
import { getSharedArtifact } from "@/lib/api";
import { artifactIcon, artifactLabel } from "@/lib/artifacts";
import type { Artifact } from "@/lib/types";

export default function SharedArtifactPage() {
  const params = useParams<{ artifactId: string }>();
  const artifactId = params.artifactId;
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadSharedArtifact() {
      try {
        const data = await getSharedArtifact(artifactId);
        if (!mounted) return;
        setArtifact(data.artifact);
        setCourseTitle(data.course_title);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "共享资源不可用");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadSharedArtifact();
    return () => {
      mounted = false;
    };
  }, [artifactId]);

  return (
    <main className="shared-artifact-page">
      <header className="shared-artifact-header">
        <Link href="/" className="shared-artifact-home">NetNote</Link>
        <div className="min-w-0 flex-1">
          <p>{courseTitle || "共享资源"}</p>
          <h1>{artifact?.title ?? (loading ? "正在加载..." : "资源不可用")}</h1>
        </div>
      </header>
      <section className="shared-artifact-shell">
        {loading ? <div className="shared-artifact-state">正在加载共享资源...</div> : null}
        {!loading && error ? <div className="shared-artifact-state">{error}</div> : null}
        {!loading && artifact ? (
          <>
            <div className="shared-artifact-title">
              <span>{artifactIcon(artifact.kind)}</span>
              <div>
                <h2>{artifact.title}</h2>
                <p>{artifactLabel(artifact.kind)}</p>
              </div>
            </div>
            <ArtifactDetail
              artifact={artifact}
              onAsk={() => undefined}
              onRefresh={async () => undefined}
              onClose={undefined}
              onCollapse={undefined}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
