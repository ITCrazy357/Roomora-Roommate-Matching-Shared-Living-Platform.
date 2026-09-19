import Image from "next/image";
import { Badge, ButtonLink, Card } from "@/components/ui";

export default function Home() {
  return (
    <div className="container home">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <Badge>KHỞI ĐẦU MỘT CHƯƠNG MỚI</Badge>
          <h1 id="home-title">
            Một nơi ở vừa ý.
            <br />
            Một người bạn
            <br />
            <span>thật hợp mình.</span>
          </h1>
          <p>
            Nhà không chỉ là một địa chỉ. Đó là nơi bạn được là chính mình, cùng
            những người có chung nhịp sống.
          </p>
          <div className="hero-actions">
            <ButtonLink href="/tim-phong">
              Khám phá phòng <span aria-hidden="true">↗</span>
            </ButtonLink>
            <ButtonLink href="/tim-nguoi-o-ghep" variant="secondary">
              Tìm người ở ghép
            </ButtonLink>
          </div>
          <div className="hero-note">
            <span aria-hidden="true">✳</span> Bắt đầu từ điều phù hợp với bạn.
          </div>
        </div>
        <figure className="hero-visual">
          <Image
            src="/images/roomora-home.png"
            alt="Minh họa không gian phòng ấm áp với ban công đầy nắng và cây xanh"
            fill
            sizes="(max-width: 767px) 100vw, 50vw"
            preload
            className="hero-image"
          />
          <div className="image-note">
            <span aria-hidden="true">⌂</span>
            <div>
              Chút nắng. Chút xanh.
              <br />
              <strong>Thêm một chút an yên.</strong>
            </div>
          </div>
          <figcaption>Hình ảnh minh họa không gian sống</figcaption>
        </figure>
      </section>
      <section className="journey-section" aria-labelledby="journey-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BẠN MUỐN BẮT ĐẦU TỪ ĐÂU?</span>
            <h2 id="journey-title">Hai lối đi, cùng một mái nhà.</h2>
          </div>
          <p>
            Mỗi người một nhu cầu.
            <br />
            Chọn hành trình của riêng bạn.
          </p>
        </div>
        <div className="journey-grid">
          <Card className="journey-card">
            <div className="journey-icon" aria-hidden="true">
              ⌂
            </div>
            <div>
              <h3>Tìm một căn phòng</h3>
              <p>
                Một góc riêng để nghỉ ngơi, làm việc và tận hưởng cuộc sống theo
                cách của bạn.
              </p>
              <ButtonLink href="/tim-phong" variant="secondary">
                Khám phá hướng tìm phòng <span aria-hidden="true">→</span>
              </ButtonLink>
            </div>
          </Card>
          <Card className="journey-card">
            <div className="journey-icon peach" aria-hidden="true">
              ☷
            </div>
            <div>
              <h3>Tìm người cùng nhà</h3>
              <p>
                Chia sẻ không gian với người đồng điệu về thói quen, sự riêng tư
                và nhịp sống.
              </p>
              <ButtonLink href="/tim-nguoi-o-ghep" variant="secondary">
                Khám phá hướng ở ghép <span aria-hidden="true">→</span>
              </ButtonLink>
            </div>
          </Card>
        </div>
      </section>
      <section className="brand-note" aria-label="Tinh thần Roomora">
        <span aria-hidden="true">✳</span>
        <p>
          Ở cùng nhau, <strong>sống đúng với mình.</strong>
        </p>
        <p>
          Từ một căn phòng đến cảm giác thuộc về — Roomora bắt đầu với sự thấu
          hiểu.
        </p>
      </section>
    </div>
  );
}
