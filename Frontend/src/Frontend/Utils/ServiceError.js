// src/Frontend/Utils/ServiceError.js
class ServiceError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ServiceError';
    this.success = false;
    this.details = details;
  }
}

export default ServiceError;