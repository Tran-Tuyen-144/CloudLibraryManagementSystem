import flowers from "../../assets/decor/violet-corner.png";
import butterflies from "../../assets/decor/purple-butterflies.png";

function Butterfly({ className = "" }) {
  return (
    <span className={`botanical-butterfly ${className}`}>
      <img src={butterflies} alt="" draggable={false} decoding="async" />
    </span>
  );
}

export default function BotanicalDecor({ placement = "page" }) {
  return (
    <div
      className={`botanical-decor botanical-decor--${placement}`}
      aria-hidden="true"
    >
      <img
        className="botanical-flowers"
        src={flowers}
        alt=""
        draggable={false}
        decoding="async"
      />

      <Butterfly className="botanical-butterfly--first" />

      {placement === "page" && (
        <Butterfly className="botanical-butterfly--second" />
      )}
    </div>
  );
}
