"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { Button, ButtonLink, ErrorState, LoadingState } from "../ui";
import { apiFetch } from "@/lib/api";
import { peopleError, type Person } from "@/lib/people";
import { PersonDetails } from "./person-details";

export function PublicPerson({ userId }: { userId: string }) {
  const { user } = useAuth();
  const [refreshCount, setRefreshCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    requestKey: string;
    person?: Person;
    error?: string;
  }>({ requestKey: "" });
  const requestKey = `${userId}:${user?.id ?? ""}:${refreshCount}`;
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Person>(`/people/${userId}`, { signal: controller.signal })
      .then((person) => setResult({ requestKey, person }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ requestKey, error: peopleError(error) });
      });
    return () => controller.abort();
  }, [userId, requestKey]);
  const isCurrentResult = result.requestKey === requestKey;
  return (
    <section className="container page-section people-public-page">
      <ButtonLink href="/tim-nguoi-o-ghep" variant="secondary">
        ← Tìm người ở ghép
      </ButtonLink>
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {!isCurrentResult ? (
        <LoadingState />
      ) : result.person ? (
        <PersonDetails
          key={result.person.userId}
          person={result.person}
          publicPage
          onChange={(message) => {
            setNotice(message);
            setRefreshCount((value) => value + 1);
          }}
        />
      ) : (
        <ErrorState
          message={result.error || "Hồ sơ chưa sẵn sàng."}
          action={
            <Button onClick={() => setRefreshCount((value) => value + 1)}>
              Làm mới
            </Button>
          }
        />
      )}
    </section>
  );
}
