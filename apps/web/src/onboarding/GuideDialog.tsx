import { useEffect, useRef } from "react";
import "./guide.css";

interface Props {
  onClose: () => void;
}

const SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: "这是什么",
    lines: [
      "在浏览器里搭一张网络，配好地址，验证到底通不通。",
      "像网络模拟器，但面向家庭和小公司的真实环境。",
      "所有数据都留在你自己的浏览器里，不上传。",
    ],
  },
  {
    title: "怎么用",
    lines: [
      "从左侧把设备拖到画布，从端口圆点拖到另一个端口就是一根线。",
      "点设备，在右侧改配置；点右侧的「ping 外网」立刻验证。",
      "不通的时候看逐跳说明，点「定位」跳到出问题的地方。",
    ],
  },
  {
    title: "能做什么",
    lines: [
      "路由器、交换机、VLAN、光猫桥接或拨号、无线 AP。",
      "配置写错当场标出来；数据包逐跳动画、traceroute、包头都能看。",
      "导入导出 JSON，撤销重做。画布上已经放好一张示例网络，点电脑试试。",
    ],
  },
];

export function GuideDialog({ onClose }: Props) {
  const start = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    start.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <button type="button" className="guide-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <h2 className="guide-title" id="guide-title">
          virtual-net
        </h2>
        {SECTIONS.map((section) => (
          <section className="guide-section" key={section.title}>
            <div className="guide-section-title">{section.title}</div>
            {section.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
        <button ref={start} type="button" className="btn btn-primary guide-start" onClick={onClose}>
          开始
        </button>
      </div>
    </>
  );
}
