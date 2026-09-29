"use client";
import { useState } from "react";
import type { House } from "@/lib/houses";
import { Button, Input, Textarea } from "../ui";

export type HouseInfo = Pick<
  House,
  "name" | "address" | "description" | "rules"
>;
export const emptyInfo: HouseInfo = {
  name: "",
  address: "",
  description: "",
  rules: "",
};

export function HouseForm({
  value,
  onSave,
  pending,
  label,
}: {
  value: HouseInfo;
  onSave: (value: HouseInfo) => Promise<void>;
  pending: boolean;
  label: string;
}) {
  const [info, setInfo] = useState<HouseInfo>({
    name: value.name,
    address: value.address,
    description: value.description,
    rules: value.rules,
  });
  function change(key: keyof HouseInfo, text: string) {
    setInfo((current) => ({ ...current, [key]: text }));
  }
  return (
    <form
      className="house-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(info);
      }}
    >
      <Input
        id="house-name"
        label="Tên nhà chung"
        value={info.name}
        minLength={2}
        maxLength={120}
        required
        onChange={(event) => change("name", event.target.value)}
      />
      <Input
        id="house-address"
        label="Địa chỉ (chỉ thành viên xem)"
        value={info.address}
        maxLength={300}
        onChange={(event) => change("address", event.target.value)}
      />
      <Textarea
        id="house-description"
        label="Giới thiệu"
        value={info.description}
        maxLength={1000}
        rows={3}
        onChange={(event) => change("description", event.target.value)}
      />
      <Textarea
        id="house-rules"
        label="Nội quy"
        value={info.rules}
        maxLength={3000}
        rows={5}
        onChange={(event) => change("rules", event.target.value)}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : label}
      </Button>
    </form>
  );
}
