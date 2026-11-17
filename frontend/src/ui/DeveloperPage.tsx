import { useStore } from '../store';

const PHOTO = `${import.meta.env.BASE_URL}developer.jpg`;
const EMAIL = 'bansilalbairwa@gmail.com';
const LINKEDIN = 'https://www.linkedin.com/in/dr-bansilal-bairwa-4816b2106/';

const STATS: [string, string][] = [
  ['85', 'Scopus-indexed documents'],
  ['510', 'Scopus citations'],
  ['15', 'H-index'],
  ['8', 'Indian patent applications'],
  ['12', 'KSCST-funded projects (10 as PI)'],
  ['26', 'Invited talks & keynotes'],
];

const EDUCATION: [string, string][] = [
  ['Ph.D.', 'Malaviya National Institute of Technology (MNIT), Jaipur · 2021'],
  ['M.Tech. Power & Energy Systems', 'NIT Karnataka, Surathkal · 2016'],
  ['B.Tech. Electrical Engineering', '2014'],
  ['PG Certification in Robotics', 'Indian Institute of Technology (IIT) Palakkad · 2026'],
];

const DOMAINS = [
  'Electric Vehicle Technologies and EV Powertrain Modelling',
  'Lithium-Ion Battery Modelling, BMS and Battery Parameter Estimation',
  'Battery Pack Design, Thermal Management and Simulation',
  'Robotics, Humanoid Robotics and Industrial Automation',
  'ROS 2 (Robot Operating System) and Robotics Application Development',
  'Robot Simulation and Digital Prototyping using Gazebo, CoppeliaSim and Webots',
  'Robot Motion Planning and Manipulation using MoveIt',
  '3D Mechanical Design and CAD Modelling using SolidWorks and Autodesk Fusion',
  'Industrial Robot Programming and Simulation using RoboDK',
  'MATLAB & Simulink for Engineering Applications',
  'Artificial Intelligence and Machine Learning for Engineering',
  'Model-Based Design, MATLAB Simscape and Control Systems',
  'Power Electronics, Motor Drives and Embedded Systems',
  'Python Programming and Engineering Applications',
  'EV Simulation, Drive Cycle Analysis and Virtual Laboratories',
];

const PLATFORMS: [string, string][] = [
  ['Robot Operating System', 'ROS 2'],
  ['Robot Simulation', 'Gazebo, CoppeliaSim, Webots'],
  ['Robot Motion Planning', 'MoveIt'],
  ['Mechanical Design & CAD', 'SolidWorks, Autodesk Fusion'],
  ['Industrial Robot Simulation', 'RoboDK'],
  ['Engineering Modelling & Simulation', 'MATLAB, Simulink, Simscape'],
  ['Programming & Development', 'Python, Arduino'],
];

const AUDIENCE = ['UG & PG students', 'Research scholars', 'Faculty members', 'Working professionals', 'Industry engineers'];

/** Compact credit card used on the dashboard and documentation footers. */
export function DeveloperCredit() {
  const setPage = useStore((s) => s.setPage);
  return (
    <button className="dev-credit" onClick={() => setPage('developer')}>
      <img src={PHOTO} alt="Dr. Bansilal Bairwa" />
      <div>
        <span className="k">Developed by</span>
        <b>Dr. Bansilal Bairwa</b>
        <span className="muted small">Assistant Professor, School of EEE, REVA University, Bengaluru · Electric Vehicles · Robotics & Automation · ROS 2 · AI/ML · MATLAB & Simulink</span>
      </div>
      <span className="dev-credit-go">About the developer →</span>
    </button>
  );
}

export function DeveloperPage() {
  return (
    <div className="page"><div className="page-in dev">
      <div className="dev-hero">
        <img className="dev-photo" src={PHOTO} alt="Dr. Bansilal Bairwa" />
        <div>
          <div className="tagline">Developed by</div>
          <h1>Dr. Bansilal Bairwa</h1>
          <div className="dev-role">Assistant Professor · School of Electrical and Electronics Engineering · REVA University, Bengaluru, India</div>
          <div className="dev-tags">
            {['Electric Vehicles', 'Robotics & Automation', 'ROS 2', 'AI/ML', 'MATLAB & Simulink'].map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
          <p>
            Dr. Bansilal Bairwa is an academician, researcher, innovator and technical trainer. His expertise encompasses Electric Vehicle
            Technologies, Lithium-Ion Battery Modelling, Battery Management Systems (BMS), Battery Thermal Management, EV Powertrain Modelling,
            Robotics and Automation, Humanoid Robotics, Robot Kinematics and Dynamics, ROS 2, Artificial Intelligence and Machine Learning,
            Power Electronics, Embedded Systems, and MATLAB & Simulink-based modelling and simulation.
          </p>
          <div className="row">
            <a className="btn brand" href={`mailto:${EMAIL}`}>Email: {EMAIL}</a>
            <a className="btn" href={LINKEDIN} target="_blank" rel="noopener noreferrer">LinkedIn profile ↗</a>
          </div>
        </div>
      </div>

      <div className="dev-stats">
        {STATS.map(([n, l]) => <div key={l} className="dev-stat"><b>{n}</b><span>{l}</span></div>)}
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card dev-card">
          <div className="h3">Education</div>
          {EDUCATION.map(([d, w]) => <div key={d} className="dev-edu"><b>{d}</b><span>{w}</span></div>)}
        </div>
        <div className="card dev-card">
          <div className="h3">Recognition & engagement</div>
          <p>8 recognitions and awards, including the <b>REVA University Best Researcher Award (2024)</b>, two IEEE Best Paper Awards and three Best Poster Awards.</p>
          <p>26 invited expert sessions, keynote lectures and resource-person engagements at reputed institutions and AICTE ATAL Faculty Development Programmes — including NIT Karnataka, NIT Warangal, NIT Durgapur, Bangalore Institute of Technology, Dayananda Sagar College of Engineering and M.S. Ramaiah Institute of Technology.</p>
          <p>Industry collaboration with <b>Bosch Global Software Technologies</b>, <b>MathWorks</b> and <b>CoreEL Technologies</b>.</p>
        </div>
      </div>

      <div className="h2">Virtual laboratories</div>
      <div className="grid3">
        <div className="tile" style={{ cursor: 'default' }}><span className="k">This platform</span><h3>ROBOVERSE</h3><p>Virtual robotics construction, assembly & simulation laboratory.</p></div>
        <div className="tile" style={{ cursor: 'default' }}><span className="k">Electric vehicles</span><h3>EV MASTER LAB</h3><p>Interactive online virtual laboratory for Electric Vehicle System Engineering.</p></div>
        <div className="tile" style={{ cursor: 'default' }}><span className="k">Robotics</span><h3>Robotics & Instrumentation Virtual Lab</h3><p>Experiential, simulation-based and hands-on robotics and instrumentation education.</p></div>
      </div>

      <div className="h2">Technical training, FDPs & industry–academia collaboration</div>
      <div className="card dev-card">
        <p>
          Dr. Bairwa welcomes opportunities to collaborate with industries, universities, engineering colleges, technical institutions, research
          organisations and corporate training departments to conduct customised technical training programmes, Faculty Development Programmes
          (FDPs), hands-on workshops, certification courses, expert lectures, short-term training programmes and industry-oriented skill
          development initiatives.
        </p>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div>
            <div className="h3">Major technical training domains</div>
            <ol className="dev-list">{DOMAINS.map((d) => <li key={d}>{d}</li>)}</ol>
          </div>
          <div>
            <div className="h3">Robotics software & engineering platforms</div>
            <div className="dev-plat">
              {PLATFORMS.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
            <div className="h3" style={{ marginTop: 16 }}>Programmes customised for</div>
            <div className="dev-tags">{AUDIENCE.map((a) => <span key={a} className="tag">{a}</span>)}</div>
          </div>
        </div>
      </div>

      <div className="h2">Professional contact</div>
      <div className="card dev-card dev-contact">
        <div><span>Name</span><b>Dr. Bansilal Bairwa</b></div>
        <div><span>Designation</span><b>Assistant Professor</b></div>
        <div><span>Institution</span><b>REVA University, Bengaluru, India</b></div>
        <div><span>Email</span><a href={`mailto:${EMAIL}`}>{EMAIL}</a></div>
        <div><span>LinkedIn</span><a href={LINKEDIN} target="_blank" rel="noopener noreferrer">linkedin.com/in/dr-bansilal-bairwa-4816b2106</a></div>
        <p className="muted small" style={{ gridColumn: '1 / -1', margin: '6px 0 0' }}>
          For industry & university training enquiries, please connect through email or LinkedIn for organising technical workshops,
          hands-on training, FDPs, certification programmes and collaborative research initiatives.
        </p>
      </div>
    </div></div>
  );
}
