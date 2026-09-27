"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

const slides = [
  {
    src: "/images/home-balcony.webp",
    alt: "Phòng ngủ ấm áp mở ra ban công có cây xanh",
    title: "Chút nắng. Chút xanh.",
    caption: "Thêm một chút an yên.",
  },
  {
    src: "/images/home-sunlight.webp",
    alt: "Phòng ngủ sáng thoáng với cửa sổ lớn, cây xanh và bàn làm việc",
    title: "Một góc nhỏ đầy nắng.",
    caption: "Cho những ngày thật nhẹ nhàng.",
  },
  {
    src: "/images/home-evening.webp",
    alt: "Phòng ngủ với ánh đèn ấm và cửa sổ nhìn ra thành phố buổi tối",
    title: "Khi thành phố lên đèn.",
    caption: "Có một nơi để trở về.",
  },
  {
    src: "/images/home-loft.webp",
    alt: "Căn phòng gác lửng với nội thất gỗ, bếp nhỏ và cây xanh",
    title: "Một nhịp sống riêng.",
    caption: "Một mái nhà thật hợp mình.",
  },
];

// Copies at both ends keep next/previous navigation seamless.
const loopingSlides = [slides[slides.length - 1], ...slides, slides[0]];

export function HomeSlideshow() {
  const [activeSlide, setActiveSlide] = useState(1);
  const [transitionEnabled, setTransitionEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    function updatePreference() {
      setReducedMotion(preference.matches);
      setTransitionEnabled(false);
      setActiveSlide(
        (index) => ((index - 1 + slides.length) % slides.length) + 1,
      );
    }
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  const changeSlide = useCallback(
    (direction: number) => {
      setTransitionEnabled(!reducedMotion);
      setActiveSlide((index) => {
        if (reducedMotion)
          return ((index - 1 + direction + slides.length) % slides.length) + 1;
        if (index === 0 || index === slides.length + 1) return index;
        return index + direction;
      });
    },
    [reducedMotion],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) changeSlide(1);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [changeSlide]);

  const selectedSlide = (activeSlide - 1 + slides.length) % slides.length;
  const slide = slides[selectedSlide];
  const changingEnds = activeSlide === 0 || activeSlide === slides.length + 1;
  return (
    <figure
      className="hero-visual"
      aria-label="Không gian sống Roomora"
      aria-roledescription="trình chiếu ảnh"
    >
      <div
        className={`hero-slide-track${transitionEnabled ? "" : " without-transition"}`}
        style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        onTransitionEnd={(event) => {
          if (
            event.target !== event.currentTarget ||
            event.propertyName !== "transform"
          )
            return;
          if (changingEnds) {
            setTransitionEnabled(false);
            setActiveSlide(activeSlide === 0 ? slides.length : 1);
          }
        }}
      >
        {loopingSlides.map((item, index) => (
          <div
            key={`${item.src}-${index}`}
            className="hero-slide"
            aria-hidden={index !== activeSlide}
          >
            <Image
              src={item.src}
              alt={item.alt}
              fill
              unoptimized
              preload={index === 1}
              loading={index === 1 ? undefined : "eager"}
              className="hero-image"
            />
          </div>
        ))}
      </div>
      <div className="image-note">
        <span aria-hidden="true">⌂</span>
        <div>
          {slide.title}
          <br />
          <strong>{slide.caption}</strong>
        </div>
      </div>
      <button
        type="button"
        className="hero-slide-arrow previous"
        aria-label="Xem ảnh trước"
        disabled={changingEnds}
        onClick={() => changeSlide(-1)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m15 6-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="hero-slide-arrow next"
        aria-label="Xem ảnh sau"
        disabled={changingEnds}
        onClick={() => changeSlide(1)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <figcaption>Hình ảnh minh họa không gian sống</figcaption>
    </figure>
  );
}
