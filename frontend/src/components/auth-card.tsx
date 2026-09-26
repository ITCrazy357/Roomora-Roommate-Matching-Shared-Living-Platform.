import Image from "next/image";
import { Card } from "./ui";

export function AuthCard({
  eyebrow,
  title,
  description,
  welcome = false,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  welcome?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`auth-page container${welcome ? " auth-welcome" : ""}`}
      aria-labelledby="auth-title"
    >
      {welcome && (
        <aside className="auth-story" aria-label="Hợp người, chung nhà">
          <span className="auth-tag">HỢP NGƯỜI, CHUNG NHÀ</span>
          <h2>
            Một nơi để ở.
            <br />
            Một chốn để về.
          </h2>
          <p>
            Không gian vừa ý, người bạn đồng điệu. Hành trình tìm nơi thuộc về
            bắt đầu từ bạn.
          </p>
          <div className="auth-image">
            <Image
              src="/images/roomora-home.png"
              alt="Không gian sống ấm áp với cây xanh và ánh nắng"
              fill
              sizes="(max-width: 767px) 1px, 45vw"
            />
          </div>
          <p className="auth-story-note">
            Chút nắng. Chút xanh. Thêm một chút an yên.
          </p>
        </aside>
      )}
      <Card className="auth-card">
        <span className="eyebrow">{eyebrow}</span>
        <h1 id="auth-title">{title}</h1>
        <p className="text-muted">{description}</p>
        {children}
      </Card>
    </section>
  );
}
