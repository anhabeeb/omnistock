import { NavLink } from "react-router-dom";

interface ModuleSubnavItem {
  label: string;
  to: string;
}

interface Props {
  items: ModuleSubnavItem[];
}

export function ModuleSubnav({ items }: Props) {
  return (
    <nav className="module-subnav" aria-label="Section navigation">
      <div className="module-subnav-track">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? "module-subnav-link active" : "module-subnav-link"
            }
            end
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
