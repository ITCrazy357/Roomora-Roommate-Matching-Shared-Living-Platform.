import type { Person } from "@/lib/people";

export function PersonAvatar({
  person,
}: {
  person: Pick<Person, "displayName" | "avatarUrl">;
}) {
  return (
    <span className="person-avatar">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatarUrl}
          alt={`Ảnh đại diện ${person.displayName}`}
        />
      ) : (
        <span aria-hidden="true">
          {person.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
