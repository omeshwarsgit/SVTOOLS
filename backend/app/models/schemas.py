from datetime import datetime, date
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, Float, ForeignKey, UniqueConstraint, func
)
from sqlalchemy.orm import relationship
from pydantic import BaseModel, Field

from app.core.database import Base


# ==========================================
# SQLAlchemy Declarative Models
# ==========================================

class PropertyMaster(Base):
    __tablename__ = "properties_master"

    primary_property_id = Column(Integer, primary_key=True, index=True)
    svid = Column(String(50), nullable=True, index=True)
    property_name = Column(String(255), nullable=False, index=True)
    sv_url = Column(Text, default="not available")
    agoda_url = Column(Text, default="not available")
    mmt_url = Column(Text, default="not available")
    booking_url = Column(Text, default="not available")
    airbnb_url = Column(Text, default="not available")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    representatives = relationship("PropertyRepresentative", back_populates="property", cascade="all, delete-orphan")


class PropertyRepresentative(Base):
    __tablename__ = "property_representatives"

    id = Column(Integer, primary_key=True, autoincrement=True)
    primary_property_id = Column(Integer, ForeignKey("properties_master.primary_property_id", ondelete="CASCADE"), nullable=False, index=True)
    ota_channel = Column(String(50), nullable=False, index=True)
    agent_name = Column(String(255), nullable=False, index=True)

    property = relationship("PropertyMaster", back_populates="representatives")

    __table_args__ = (
        UniqueConstraint("primary_property_id", "ota_channel", "agent_name", name="uq_prop_rep_agent"),
    )


class ReconciliationBatch(Base):
    __tablename__ = "reconciliation_batches"

    batch_id = Column(String(36), primary_key=True, index=True)
    upload_date = Column(Date, nullable=False)
    su_filename = Column(String(255), nullable=True)
    pms_filename = Column(String(255), nullable=True)
    total_su_records = Column(Integer, default=0)
    total_pms_records = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    reservations = relationship("Reservation", back_populates="batch", cascade="all, delete-orphan")
    discrepancies = relationship("Discrepancy", back_populates="batch", cascade="all, delete-orphan")


class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String(36), ForeignKey("reconciliation_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    reservation_id = Column(String(100), nullable=False, index=True)
    property_id = Column(Integer, nullable=True, index=True)
    guest_name = Column(String(255), nullable=True)
    channel = Column(String(50), nullable=False, index=True)
    booking_status = Column(String(50), nullable=False, index=True)
    check_in = Column(Date, nullable=True)
    check_out = Column(Date, nullable=True)
    source_system = Column(String(10), nullable=False)  # 'SU' or 'PMS'
    raw_source_string = Column(String(255), nullable=True)
    admin_booking_status = Column(String(100), nullable=True)
    check_flag = Column(Float, nullable=True)

    batch = relationship("ReconciliationBatch", back_populates="reservations")

    __table_args__ = (
        UniqueConstraint("batch_id", "reservation_id", "booking_status", "source_system", name="uq_batch_res_status_sys"),
    )


class Discrepancy(Base):
    __tablename__ = "discrepancies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String(36), ForeignKey("reconciliation_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    reservation_id = Column(String(100), nullable=False, index=True)
    channel = Column(String(50), nullable=False, index=True)
    status_category = Column(String(50), nullable=False, index=True)  # 'Confirmed', 'Cancelled', 'In-Transit'
    discrepancy_type = Column(String(50), nullable=False, index=True)
    property_id = Column(Integer, nullable=True, index=True)
    property_name = Column(String(255), nullable=True)
    assigned_representative = Column(String(255), nullable=True)
    target_portal_url = Column(Text, nullable=False, default="not available")
    guest_name = Column(String(255), nullable=True)
    check_in = Column(Date, nullable=True)
    check_out = Column(Date, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    batch = relationship("ReconciliationBatch", back_populates="discrepancies")


# ==========================================
# MIS Dashboard Pydantic Schemas
# ==========================================

class MISPrimaryMetrics(BaseModel):
    total_bookings: int = 1134
    matched: int = 813
    mismatched: int = 91
    missing: int = 230
    cancellation_pending: int = 14


class MISSecondaryMetrics(BaseModel):
    pms_base_rows: int = 2848
    pms_query_rows: int = 334
    pms_tentative_noshow: int = 39
    pms_not_found_in_su: int = 1965
    base_vs_query_mismatch: int = 37
    query_missing_in_base: int = 49
    su_status_unclear: int = 0


class MISTabItem(BaseModel):
    id: str
    reservation_id: str
    vendor_booking_id: Optional[str] = None
    guest_name: Optional[str] = None
    channel: str = "Others"
    su_status: Optional[str] = None
    pms_status: Optional[str] = None
    admin_status: Optional[str] = None
    property_id: Optional[int] = None
    property_name: Optional[str] = None
    target_portal_url: str = "not available"
    assigned_representative: str = "Unassigned"
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    match_type: Optional[str] = None
    notes: Optional[str] = None


class MISDashboardData(BaseModel):
    batch_id: str
    last_run: str
    primary_metrics: MISPrimaryMetrics
    secondary_metrics: MISSecondaryMetrics
    tab_counts: Dict[str, int]
    tabs_data: Dict[str, List[MISTabItem]]


# ==========================================
# Batch Overview & Matrices Schemas
# ==========================================

class MatrixRow(BaseModel):
    channel: str
    su: int
    pms: int
    variance: int


class ReconciliationMatrix(BaseModel):
    confirmed: List[MatrixRow]
    cancelled: List[MatrixRow]


class AlertSummary(BaseModel):
    in_transit_count: int = 0
    customer_concern_count: int = 0
    edge_status_count: int = 0
    missing_in_pms_count: int = 0
    missing_in_su_count: int = 0
    status_mismatch_count: int = 0
    total_discrepancies: int = 0


class DiscrepancyItem(BaseModel):
    id: int
    batch_id: str
    reservation_id: str
    channel: str
    status_category: str
    discrepancy_type: str
    property_id: Optional[int] = None
    property_name: Optional[str] = None
    assigned_representative: Optional[str] = None
    target_portal_url: str
    guest_name: Optional[str] = None
    check_in: Optional[date] = None
    check_out: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DiscrepancyListResponse(BaseModel):
    items: List[DiscrepancyItem]
    total: int
    page: int
    page_size: int
    pages: int


class BatchOverview(BaseModel):
    batch_id: str
    upload_date: date
    su_filename: Optional[str] = None
    pms_filename: Optional[str] = None
    total_su_records: int
    total_pms_records: int
    created_at: datetime
    matrix: ReconciliationMatrix
    alerts: AlertSummary

    class Config:
        from_attributes = True


class BatchListItem(BaseModel):
    batch_id: str
    upload_date: date
    su_filename: Optional[str] = None
    pms_filename: Optional[str] = None
    total_su_records: int
    total_pms_records: int
    total_discrepancies: int
    created_at: datetime

    class Config:
        from_attributes = True
