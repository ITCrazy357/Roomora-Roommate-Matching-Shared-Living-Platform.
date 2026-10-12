"use client";

import { useState } from "react";
import { RoomoraFigure } from "./roomora-figure";
import { useReducedMotion } from "./use-reduced-motion";
import { Button, ButtonLink, Card } from "./ui";

const paths = [
  {
    kind: "home",
    title: "Một căn phòng vừa ý",
    description: "So sánh giá thuê, tiện ích và khu vực để chọn nơi ở hợp với bạn.",
    href: "/tim-phong",
    action: "Khám phá phòng",
  },
  {
    kind: "people",
    title: "Một người bạn hợp nhịp",
    description: "Tìm người cùng nhà có ngân sách và thói quen sinh hoạt phù hợp.",
    href: "/tim-nguoi-o-ghep",
    action: "Tìm người ở ghép",
  },
  {
    kind: "search",
    title: "Một nhu cầu rõ ràng",
    description: "Chia sẻ căn phòng bạn đang tìm để người có phòng phù hợp liên hệ.",
    href: "/dang-tin?type=ROOM_WANTED",
    action: "Đăng nhu cầu tìm phòng",
  },
] as const;

export function HomeJourney() {
  const [playing, setPlaying] = useState(true);
  const reducedMotion = useReducedMotion();
  return (
    <section className="home-journey" aria-labelledby="journey-title">
      <div className="home-journey-heading">
        <div>
          <span className="eyebrow">BẮT ĐẦU THEO CÁCH CỦA BẠN</span>
          <h2 id="journey-title">Chỗ ở hợp mình, người ở hợp nhau.</h2>
        </div>
        {!reducedMotion && (
          <Button variant="secondary" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>
            {playing ? "Tạm dừng minh họa tự động" : "Phát minh họa tự động"}
          </Button>
        )}
      </div>
      <div className="home-journey-grid">
        {paths.map((path) => (
          <Card key={path.kind} className="home-journey-card">
            <RoomoraFigure kind={path.kind} play={playing} />
            <h3>{path.title}</h3>
            <p>{path.description}</p>
            <ButtonLink variant="secondary" href={path.href}>
              {path.action}<span aria-hidden="true">↗</span>
            </ButtonLink>
          </Card>
        ))}
      </div>
    </section>
  );
}
