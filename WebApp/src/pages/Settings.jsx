import React from 'react';
import './Settings.css';

const Settings = () => {
  const configurableSettings = [
    {
      id: 1,
      title: 'Relevance Level Thresholds',
      description: '✅ COMPLETED: Similarity score thresholds are now configurable via environment variables RELEVANCE_HIGH_THRESHOLD (default: 0.70) and RELEVANCE_MEDIUM_THRESHOLD (default: 0.50). Configure in product-search-api/serverless.yml or .env file.',
      status: 'completed',
      location: 'product-search-api/api/qdrant_search.py',
      priority: 'high'
    },
    {
      id: 2,
      title: 'Product Categories',
      description: 'Make product categories configurable instead of hardcoded enum. Currently defined in webApp/src/types/products.ts. This requires creating a settings API endpoint and database table to store configurable categories.',
      status: 'pending',
      location: 'webApp/src/types/products.ts',
      priority: 'high'
    },
    {
      id: 3,
      title: 'Email Default Content',
      description: 'Make email default content configurable instead of hardcoded. Currently the email body template is hardcoded in quotation-management-service/services/email_service.py (lines 103-143). This requires creating a settings API endpoint and database table to store configurable email templates, or using environment variables for template customization.',
      status: 'pending',
      location: 'quotation-management-service/services/email_service.py',
      priority: 'high'
    }
  ];

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed':
        return 'status-badge completed';
      case 'in-progress':
        return 'status-badge in-progress';
      default:
        return 'status-badge pending';
    }
  };

  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'high':
        return 'priority-badge high';
      case 'medium':
        return 'priority-badge medium';
      default:
        return 'priority-badge low';
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h1 className="settings-title">Settings</h1>
          <p className="settings-description">
            Configure your application settings and preferences.
          </p>
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">Configuration Todo List</h2>
          <p className="settings-section-description">
            The following settings need to be made configurable:
          </p>

          <div className="todo-list">
            {configurableSettings.map((setting) => (
              <div key={setting.id} className="todo-item">
                <div className="todo-item-header">
                  <div className="todo-item-title-row">
                    <h3 className="todo-item-title">{setting.title}</h3>
                    <div className="todo-item-badges">
                      <span className={getStatusBadgeClass(setting.status)}>
                        {setting.status === 'pending' ? 'Pending' : 
                         setting.status === 'in-progress' ? 'In Progress' : 'Completed'}
                      </span>
                      <span className={getPriorityBadgeClass(setting.priority)}>
                        {setting.priority.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="todo-item-description">{setting.description}</p>
                <div className="todo-item-footer">
                  <span className="todo-item-location">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {setting.location}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

