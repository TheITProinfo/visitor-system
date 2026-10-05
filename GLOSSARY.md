# Visitor

A visitor registration system that can be configured for the company using it.

## Language

**Visitor**:
A person arriving at a company to visit someone there.
_Avoid_: Guest account, appointment holder

**Check-in**:
Registration of a visitor's arrival at the company. Visitors register on arrival without making an appointment.
_Avoid_: Booking, appointment, approval

**Check-out**:
A voluntary recording of a visitor's departure, found using the email address supplied at check-in. A visit without a check-out does not necessarily mean the visitor is still present.
_Avoid_: Confirmed presence, mandatory exit

**Host**:
The employee a visitor has come to see, identified by searching their first name or last name. If the visitor cannot find the host, reception provides assistance.
_Avoid_: Target staff, approver

**Administrator**:
A company user responsible for managing the visitor system who can also handle reception duties. This role is sufficient when the company has no dedicated receptionist.
_Avoid_: Super admin, host

**Receptionist**:
An optional company user who handles visitor reception and can view visitor records in the back office.
_Avoid_: Administrator, host

**Employee**:
A company staff member who joins through an administrator's email invitation and can log in to see visits hosted by them.
_Avoid_: Receptionist, visitor

**Configuration**:
Company-specific settings managed by the Administrator, including company information, departments, visit purposes, agreement content, and outgoing email settings.
_Avoid_: Hard-coded company settings
