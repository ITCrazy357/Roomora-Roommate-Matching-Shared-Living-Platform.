import Link from "next/link";
import { PasswordInput } from "./password-input";
import { RoomoraFigure } from "./roomora-figure";
import { ProfileIcon } from "./profile-icon";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

type Variant = "primary" | "secondary";

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  arrow = false,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; arrow?: boolean }) {
  return (
    <Link
      className={`button button-${variant} ${arrow ? "button-arrow" : ""} ${className}`}
      {...props}
    >
      {children}
      {arrow && (
        <span className="button-arrow-icon" aria-hidden="true">
          <ProfileIcon name="arrow" />
        </span>
      )}
    </Link>
  );
}

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

export function Input({
  label,
  id,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  const description = [
    props["aria-describedby"],
    hint ? `${id}-hint` : "",
    error ? `${id}-error` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {props.type === "password" ? (
        <PasswordInput
          {...props}
          id={id}
          label={label}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={description || undefined}
        />
      ) : props.type === "search" ? (
        <div className="search-input">
          <input
            {...props}
            id={id}
            aria-invalid={error ? true : props["aria-invalid"]}
            aria-describedby={description || undefined}
          />
          <span className="search-input-icon" aria-hidden="true">
            <ProfileIcon name="search" />
          </span>
        </div>
      ) : (
        <input
          {...props}
          id={id}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={description || undefined}
        />
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-muted text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function Textarea({
  label,
  id,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...props}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Select({
  label,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select {...props} id={id}>
        {children}
      </select>
    </div>
  );
}

export function Checkbox({
  label,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <label className={`ui-checkbox ${className}`}>
      <span className="ui-checkbox-control">
        <input {...props} type="checkbox" />
        <span className="ui-checkbox-box" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <path d="m4 10 4 4 8-8" />
          </svg>
        </span>
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  label,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & { label: string }) {
  return (
    <label className={`ui-switch ${className}`}>
      <span className="ui-switch-control">
        <input {...props} type="checkbox" role="switch" />
        <span className="ui-switch-track" aria-hidden="true" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function LoadingState({ message = "Đang tải…" }: { message?: string }) {
  return (
    <div className="status" role="status">
      <svg className="ui-loader" viewBox="25 25 50 50" aria-hidden="true">
        <circle r="20" cy="50" cx="50" />
      </svg>
      {message}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="empty-state">
      <RoomoraFigure kind="empty" className="empty-figure" />
      <h1>{title}</h1>
      <div className="text-muted">{children}</div>
      {action}
    </Card>
  );
}

export function ErrorState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {action}
    </div>
  );
}
