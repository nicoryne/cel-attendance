import Link from 'next/link';
import BurgerMenu from './burger-menu';
import MotionComponent from './motion-component';
import ThemeSwitcher from './theme-switcher';

export const navigationLinks = [
  { text: 'Home', href: '/' },
  { text: 'Overview', href: '/overview' }
];

export default function Navbar() {
  return (
    <nav className="bg-background fixed inset-0 top-0 z-50 h-24 w-full">
      <div className="mx-auto p-8 xl:w-[1100px]">
        <div className="flex justify-between">
          <Link href="/" className="flex items-center gap-1">
            <span className="font-semibold">CEL Volunteer Tracker</span>
          </Link>

          <div className="flex items-center gap-2 md:gap-12">
            <div className="block md:hidden">
              <BurgerMenu />
            </div>
            <div className="hidden md:block">
              <ul className="flex gap-6">
                {navigationLinks.map((link, index) => (
                  <MotionComponent
                    type="li"
                    key={index}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.9,
                      ease: 'easeIn',
                      delay: (navigationLinks.length - 1 - index) * 0.1,
                      type: 'spring'
                    }}
                  >
                    <Link
                      href={link.href}
                      className="hover:text-honey text-base transition-colors duration-200 ease-in"
                    >
                      {link.text}
                    </Link>
                  </MotionComponent>
                ))}
              </ul>
            </div>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </nav>
  );
}
