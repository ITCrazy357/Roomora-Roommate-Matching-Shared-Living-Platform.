"use client";

import { useEffect, useId, useRef, useState } from "react";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

export function SearchableSelect({
  id,
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { code: string; name: string }[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = options.filter((option) =>
    normalize(option.name).includes(normalize(query.trim())),
  );
  const selected = options.find((option) => option.code === value);
  const visible = open && !disabled;

  useEffect(() => {
    if (visible)
      list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, visible]);

  function show() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }
  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      className="field searchable-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="searchable-select-input">
        <input
          ref={input}
          id={id}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={listId}
          aria-activedescendant={
            visible && filtered[active] ? `${listId}-${active}` : undefined
          }
          value={visible ? query : (selected?.name ?? "")}
          placeholder={visible ? "Gõ tên để tìm…" : placeholder}
          disabled={disabled}
          onFocus={show}
          onClick={() => {
            if (!visible) show();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!visible) {
                show();
                return;
              }
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    filtered.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (!visible) show();
              else if (filtered[active]) choose(filtered[active].code);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Mở danh sách ${label.toLowerCase()}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (visible) setOpen(false);
            else {
              input.current?.focus();
              show();
            }
          }}
        >
          ⌄
        </button>
      </div>
      {visible && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className="searchable-select-options"
        >
          {filtered.map((option, index) => (
            <li key={option.code} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.code === value}
                tabIndex={-1}
                className={index === active ? "is-active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.code)}
              >
                {option.name}
              </button>
            </li>
          ))}
          {!filtered.length && (
            <li role="presentation" className="searchable-select-empty">
              Không tìm thấy địa điểm phù hợp.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
