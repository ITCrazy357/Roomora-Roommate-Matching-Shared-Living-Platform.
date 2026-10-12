"use client";

import { useState } from "react";
import { RoomoraFigure } from "./roomora-figure";
import { useReducedMotion } from "./use-reduced-motion";
import Link from "next/link";
import { Button } from "./ui";
import { ProfileIcon } from "./profile-icon";

const paths = [
  {
    kind: "home",
    title: "Một căn phòng vừa ý",
    description:
      "So sánh giá thuê, tiện ích và khu vực để chọn nơi ở hợp với bạn.",
    href: "/tim-phong",
    action: "Khám phá phòng",
  },
  {
    kind: "people",
    title: "Một người bạn hợp nhịp",
    description:
      "Tìm người cùng nhà có ngân sách và thói quen sinh hoạt phù hợp.",
    href: "/tim-nguoi-o-ghep",
    action: "Tìm người ở ghép",
  },
  {
    kind: "search",
    title: "Một nhu cầu rõ ràng",
    description:
      "Chia sẻ căn phòng bạn đang tìm để người có phòng phù hợp liên hệ.",
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
          <h2 id="journey-title">Bắt đầu từ điều bạn cần.</h2>
        </div>
        {!reducedMotion && (
          <Button
            variant="secondary"
            aria-pressed={playing}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? "Tạm dừng minh họa" : "Phát minh họa"}
          </Button>
        )}
      </div>
      <div className="home-journey-grid">
        <RoomoraFigure
          kind="people"
          play={playing}
          className="journey-figure"
        />
        <div className="home-journey-paths">
          {paths.map((path) => (
            <Link
              key={path.kind}
              className="home-journey-path"
              href={path.href}
            >
              <div>
                <h3>{path.action}</h3>
                <p>{path.description}</p>
              </div>
              <ProfileIcon name="arrow" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
