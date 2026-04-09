import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import { useAuth } from '../../Context/AuthContext';
import TokenTimer from '../TokenTimer';

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const getPageTitle = () => {
    const path = location.pathname;
    const titleMap = {
      '/dashboard': 'Dashboard',
      '/users': 'User Management',
      '/users/new': 'Add Users',
      '/customers': 'Customer Management',
      '/customers/new': 'Add New Customer',
      '/payments/calculator': 'Payment Calculator',
      '/payments/generate': 'Generate Monthly Payments',
      '/payments/schedule': 'Payment Schedule',
      '/payments/initiate': 'Initiate Payment',
      '/payments/payments-view': 'Payment View',
      '/payments/history': 'Payment History',
      '/financial': 'Financial Management',
      '/escalation': 'Escalation Tracker',
      '/tds/tracker': 'TDS Tracker',
      '/tds/certificates': 'TDS Certificates',
      '/tds/monthly': 'Monthly Summary',
      '/receipts': 'Receipts',
      '/reports': 'Reports',
      '/settings': 'Settings'
    };
    return titleMap[path] || 'Rental Management';
  };

  // 🔥 Role-based menu configuration
  const menuItems = [
    {
      path: '/dashboard',
      icon: 'bi-speedometer2',
      label: 'Dashboard'
    },

    {
      section: 'User Management',
      roles: ['SUPERADMIN'], // 👈 Only SUPERADMIN can see
      items: [
        { path: '/users', icon: 'bi-people', label: 'All Users' },
        { path: '/users/new', icon: 'bi-person-plus', label: 'Add Users' }
      ]
    },

    {
      section: 'Customer Management',
      items: [
        { path: '/customers', icon: 'bi-people', label: 'All Customers' },
        { path: '/customers/new', icon: 'bi-person-plus', label: 'Add Customer' }
      ]
    },
    

    {
      section: 'Payments',
      items: [
        { path: '/financial', icon: 'bi-cash-stack', label: 'Financial Management' },
        { path: '/payments/calculator', icon: 'bi-calculator', label: 'Calculator' },
        { path: '/payments/generate', icon: 'bi-calendar-plus', label: 'Generate Payments' },
        { path: '/payments/schedule', icon: 'bi-calendar-check', label: 'Schedule' },
        { path: '/payments/initiate', icon: 'bi-send', label: 'Initiate Payment' },
        { path: '/payments/history', icon: 'bi-clock-history', label: 'History' }
      ]
    },

    { path: '/escalation', icon: 'bi-graph-up-arrow', label: 'Escalations' },

    {
      section: 'TDS Management',
      items: [
        { path: '/tds/tracker', icon: 'bi-receipt', label: 'TDS Tracker' },
        { path: '/tds/certificates', icon: 'bi-file-earmark-text', label: 'Certificates' },
        { path: '/tds/monthly', icon: 'bi-bar-chart', label: 'Monthly Summary' }
      ]
    },

    { path: '/receipts', icon: 'bi-receipt-cutoff', label: 'Receipts' },
    { path: '/reports', icon: 'bi-file-earmark-bar-graph', label: 'Reports' },
    { path: '/settings', icon: 'bi-gear', label: 'Settings' }
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'show' : ''}`}>
        <div className="sidebar-header">
          <h4><i className="bi bi-building"></i> R-ONE</h4>
          <p className="mb-0 small">Payment Management System</p>
        </div>

        <div className="sidebar-nav">
          {menuItems.map((item, index) => {

            // 🔐 Role check for section
            if (item.roles && !item.roles.includes(user?.role)) {
              return null;
            }

            // 🔹 If section exists
            if (item.section) {
              return (
                <div key={index}>
                  <div className="px-3 py-2 mt-3">
                    <small className="text-white-50 text-uppercase fw-bold">
                      {item.section}
                    </small>
                  </div>

                  {item.items.map((subItem, subIndex) => (
                    <div className="nav-item" key={subIndex}>
                      <NavLink
                        to={subItem.path}
                        className="nav-link"
                        onClick={() =>
                          window.innerWidth < 768 && setSidebarOpen(false)
                        }
                      >
                        <i className={subItem.icon}></i>
                        <span>{subItem.label}</span>
                      </NavLink>
                    </div>
                  ))}
                </div>
              );
            }

            // 🔹 Normal single menu item
            return (
              <div className="nav-item" key={index}>
                <NavLink
                  to={item.path}
                  className="nav-link"
                  onClick={() =>
                    window.innerWidth < 768 && setSidebarOpen(false)
                  }
                >
                  <i className={item.icon}></i>
                  <span>{item.label}</span>
                </NavLink>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="btn btn-link d-md-none text-dark"
              onClick={toggleSidebar}
            >
              <i className="bi bi-list fs-4"></i>
            </button>
            <h5>{getPageTitle()}</h5>
          </div>

          <div className="topbar-right">
            <TokenTimer onExpire={logout} />

            <button className="btn btn-light btn-icon me-2">
              <i className="bi bi-bell"></i>
            </button>

            <Dropdown align="end">
              <Dropdown.Toggle
                variant="link"
                className="user-profile text-decoration-none p-0"
              >
                <div className="user-avatar">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="d-none d-md-block ms-2 text-start">
                  <div className="fw-semibold text-dark">
                    {user?.name || 'User'}
                  </div>
                  <small className="text-muted">
                    {user?.role || 'Admin'}
                  </small>
                </div>
              </Dropdown.Toggle>

              <Dropdown.Menu>
                <Dropdown.Item href="profile">
                  <i className="bi bi-person me-2"></i> Profile
                </Dropdown.Item>
                <Dropdown.Item href="/settings">
                  <i className="bi bi-gear me-2"></i> Settings
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={logout}>
                  <i className="bi bi-box-arrow-right me-2"></i> Logout
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>

        {/* Content Area */}
        <div className="content-area">
          <Outlet />
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-md-none"
          style={{ zIndex: 999 }}
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
};

export default MainLayout;
